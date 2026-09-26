import { useState } from 'react'

/** 검색어 입력: Enter 나 [검색]을 눌렀을 때만 찾는다 (글자마다 요청하지 않게) */
export default function SearchBox({ initial = '', placeholder, onSearch }) {
  const [text, setText] = useState(initial)
  return (
    <form
      className="adm-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSearch(text.trim())
      }}
    >
      <input
        type="search"
        className="input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      <button type="submit" className="btn btn-secondary">
        검색
      </button>
    </form>
  )
}
