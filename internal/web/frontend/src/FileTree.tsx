import { Link } from "@tanstack/react-router"

import type { PageData, TreeNode } from "./page-data.ts"

interface TreeNodesProps {
  expandedPaths: ReadonlySet<string>
  nodes: readonly TreeNode[]
  onExpandedChange(path: string, expanded: boolean): void
}

function TreeNodes({ expandedPaths, nodes, onExpandedChange }: TreeNodesProps) {
  return nodes.map((node) => (
    <li key={node.path}>
      {node.isDir ? (
        <details
          open={expandedPaths.has(node.path)}
          onToggle={(event) => onExpandedChange(node.path, event.currentTarget.open)}
        >
          <summary>{node.name}/</summary>
          <ul>
            <TreeNodes
              expandedPaths={expandedPaths}
              nodes={node.children}
              onExpandedChange={onExpandedChange}
            />
          </ul>
        </details>
      ) : (
        <Link
          className={node.selected ? "selected" : undefined}
          aria-current={node.selected ? "page" : undefined}
          to="/view"
          search={{ path: node.path }}
          hash=""
        >
          {node.name}
        </Link>
      )}
    </li>
  ))
}

interface FileTreeProps {
  expandedPaths: ReadonlySet<string>
  hasData: boolean
  onExpandedChange(path: string, expanded: boolean): void
  page: PageData
}

export function FileTree({ expandedPaths, hasData, onExpandedChange, page }: FileTreeProps) {
  return (
    <aside aria-label="Markdown files" data-scroll-restoration-id="file-tree">
      <div className="tree-title">Files</div>
      {!hasData ? (
        <p className="muted">Loading Markdown files…</p>
      ) : page.empty ? (
        <p className="muted">No Markdown files found.</p>
      ) : (
        <ul className="tree">
          <TreeNodes
            expandedPaths={expandedPaths}
            nodes={page.tree}
            onExpandedChange={onExpandedChange}
          />
        </ul>
      )}
      {page.warnings.length > 0 && (
        <details className="warnings">
          <summary>Some paths could not be read</summary>
          <ul>{page.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      )}
    </aside>
  )
}
