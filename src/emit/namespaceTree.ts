// Build a nested namespace tree from dotted paths, preserving the input
// order of entries. The emitter walks this tree to produce either dotted
// assignments (single-child branches) or `name { ... }` blocks (multi-child
// branches).

export interface LeafEntry {
  readonly kind: 'leaf';
  readonly path: string;
  readonly value: unknown;
  readonly order: number; // global appearance index used for tie-breaking
}

export interface BranchEntry {
  readonly kind: 'branch';
  readonly name: string; // segment name at this level
  readonly fullPath: string; // dotted path from root to this branch
  readonly children: readonly TreeNode[]; // ordered
  readonly order: number; // smallest order index of any descendant leaf
}

export type TreeNode = LeafEntry | BranchEntry;

interface InternalNode {
  // The full path from root (for branches) or path of the bound leaf
  // (for leaves).
  fullPath: string;
  name: string; // last segment of fullPath
  leafValue?: { value: unknown; order: number };
  children: Map<string, InternalNode>;
  childOrder: string[]; // insertion order of children
  minOrder: number; // smallest leaf order under this subtree
}

function makeNode(fullPath: string, name: string): InternalNode {
  return {
    fullPath,
    name,
    children: new Map(),
    childOrder: [],
    minOrder: Number.POSITIVE_INFINITY,
  };
}

export interface OrderedEntry {
  readonly path: string;
  readonly value: unknown;
  readonly order: number;
}

/**
 * Build a tree from a list of (path, value, order) entries. The `order`
 * value reflects the entry's position in paramMetadata (used to break
 * ties when rendering). Paths sharing prefixes are merged into nested
 * branches.
 *
 * The tree returned has a synthetic root node at fullPath ''.
 */
export function buildNamespaceTree(entries: readonly OrderedEntry[]): InternalNode {
  const root = makeNode('', '');
  for (const entry of entries) {
    const segments = entry.path.split('.');
    let node = root;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const isLast = i === segments.length - 1;
      let child = node.children.get(seg);
      if (!child) {
        const fullPath = node.fullPath === '' ? seg : `${node.fullPath}.${seg}`;
        child = makeNode(fullPath, seg);
        node.children.set(seg, child);
        node.childOrder.push(seg);
      }
      if (isLast) {
        if (child.leafValue !== undefined) {
          throw new Error(`Duplicate emit entry for path: ${entry.path}`);
        }
        child.leafValue = { value: entry.value, order: entry.order };
      }
      if (entry.order < child.minOrder) child.minOrder = entry.order;
      node = child;
    }
    if (entry.order < root.minOrder) root.minOrder = entry.order;
  }
  return root;
}

/**
 * Convert the internal mutable tree at `node` into the public read-only
 * TreeNode shape. The caller controls whether this is the root or a
 * subtree. A node with a `leafValue` and no children becomes a leaf;
 * a node with children (with or without a leafValue) becomes a branch.
 *
 * Note: in this emitter's domain a leaf cannot also have children
 * because no parameter path is a prefix of another. We still defensively
 * keep the branch form when both are present.
 */
export function freezeTree(node: InternalNode): readonly TreeNode[] {
  const out: TreeNode[] = [];
  for (const childName of node.childOrder) {
    const child = node.children.get(childName)!;
    if (child.children.size === 0 && child.leafValue !== undefined) {
      out.push({
        kind: 'leaf',
        path: child.fullPath,
        value: child.leafValue.value,
        order: child.leafValue.order,
      });
    } else {
      out.push({
        kind: 'branch',
        name: child.name,
        fullPath: child.fullPath,
        children: freezeTree(child),
        order: child.minOrder,
      });
    }
  }
  return out;
}

/**
 * Count the number of emitted "lines" (leaves + immediate sub-branches)
 * directly inside a branch — used to decide between dotted form (1) and
 * block form (>=2).
 */
export function directChildCount(children: readonly TreeNode[]): number {
  return children.length;
}
