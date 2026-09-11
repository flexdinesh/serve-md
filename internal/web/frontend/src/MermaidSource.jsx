export function MermaidSource({ error, source }) {
  return (
    <>
      <pre><code className="language-mermaid">{source}</code></pre>
      {error && <p className="mermaid-error" role="status">{error}</p>}
    </>
  )
}
