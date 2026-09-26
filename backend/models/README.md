# 모델 파일 넣는 곳

Colab에서 학습한 모델을 이 폴더에 두면 서버가 시작할 때 자동으로 불러옵니다.

```
backend/models/
├── model.onnx        ← Colab 에서 내보낸 모델
└── model_meta.json   ← 입력/출력 정의 (model_meta.example.json 참고)
```

두 파일이 없으면 서버는 **임시 예측기(baseline)** 로 동작하고, 응답의 `model.mode` 가 `"baseline"` 으로 표시됩니다.
화면에도 "임시 예측 (모델 연결 전)" 배지가 붙습니다.

## 왜 ONNX 인가요?

Render 무료 플랜은 메모리가 512MB입니다. TensorFlow/PyTorch 를 통째로 올리면 설치 용량과 메모리가 부족하기 쉽습니다.
학습은 Colab 에서 원하는 프레임워크로 하고, **추론용으로 ONNX 로 내보내면** 서버는 가벼운 `onnxruntime` 만으로 예측할 수 있습니다.

## Colab 에서 내보내기

### Keras / TensorFlow

```python
!pip install tf2onnx onnx
import tf2onnx, tensorflow as tf

spec = (tf.TensorSpec((None, 8), tf.float32, name="input"),)   # 8 = features 개수
tf2onnx.convert.from_keras(model, input_signature=spec, output_path="model.onnx")
```

### PyTorch

```python
import torch
model.eval()
dummy = torch.randn(1, 8)                                         # 8 = features 개수
torch.onnx.export(model, dummy, "model.onnx", input_names=["input"], output_names=["output"],
                  dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}})
```

### 스케일러 값 저장 (StandardScaler 를 썼다면)

```python
import json
meta = {
    "version": "2026-1",
    "features": ["gpa", "merit", "demerit", "distance_score", "converted_score",
                 "college:medicine", "college:nursing", "college:law"],
    "scaler": {"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist()},
    "outputs": ["changui_1", "changui_2", "hanbit_2", "saebit_2", "hanbit_6",
                "daedong_2", "chambit_2", "hyemin_1", "hyemin_2"],
    "output_activation": "sigmoid",
}
json.dump(meta, open("model_meta.json", "w"), ensure_ascii=False, indent=2)
```

## model_meta.json 필드

| 필드 | 설명 |
| --- | --- |
| `version` | 화면에 표시되는 모델 버전 |
| `features` | 모델 입력 순서. 숫자 특성: `gpa`, `merit`, `demerit`, `distance_km`, `distance_score`, `grade_score`, `converted_score`<br>단과대학 원-핫: `college:<code>` (해당 단과대학이면 1, 아니면 0. code 는 `app/colleges.py`) |
| `scaler` | (선택) `(x - mean) / scale` 로 정규화. 학습 때와 같은 값을 넣어야 합니다 |
| `outputs` | 모델 출력 순서에 대응하는 **호실 유형** code (`app/dormitories.py` 의 `DORM_ROOMS`, 예: `changui_1` = 창의관 1인실) |
| `output_activation` | 출력이 logit 이면 `"sigmoid"`, 이미 0~1 확률이면 `"none"` |

모델 입력은 `(1, features 개수)` 크기의 float32, 출력은 `(1, outputs 개수)` 크기여야 합니다.

모델은 모든 호실 유형의 확률을 내보내고, 서버가 단과대학별로 지원할 수 없는 호실(예: 공과대학 → 혜민관)은 응답에서 뺍니다.
학습 데이터를 만들 때 스케일러는 숫자 특성에만 적용하고, 원-핫 열은 `mean 0`, `scale 1` 로 두세요.

## 파일이 큰 경우

수 MB 수준이면 그냥 Git 에 커밋해도 됩니다. 수십 MB 이상이면 Supabase Storage 에 올리고
서버 시작 시 내려받도록 `app/services/predictor.py` 의 `load_predictor` 를 확장하세요.
