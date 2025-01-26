export class RouteNode {
  constructor(
    public path: string,
    public children: RouteNode[] = [],
    public parent: RouteNode | null = null,
    public data: {
      frequency: number;
      params: Record<string, string>;
      queryParams: Record<string, string>;
      depth: number;
      firstDiscoveredFrom: string | null;
      lastAccessed: Date;
      rawHtml?: string;
    },
  ) {
    this.path = path;
    this.children = children;
    this.parent = parent;
    this.data = data;
  }
}

export class RouteGraph {
  private nodes: Map<string, RouteNode> = new Map();
  private root: RouteNode;

  constructor(baseUrl: string) {
    this.root = this.createNode(baseUrl, null);
    this.nodes.set(baseUrl, this.root);
  }

  private createNode(path: string, parent: RouteNode | null): RouteNode {
    return new RouteNode(path, [], parent, {
      frequency: 1,
      params: {},
      queryParams: {},
      depth: parent ? parent.data.depth + 1 : 0,
      firstDiscoveredFrom: parent?.path || null,
      lastAccessed: new Date(),
    });
  }

  addRoute(
    path: string,
    fromPath: string | null,
    params: Record<string, any> = {},
  ): RouteNode {
    // Serialize queryParams to a string for node identification
    const queryParams = params?.queryParams;
    const queryKey = new URLSearchParams(queryParams).toString();
    const uniquePath = queryKey ? `${path}?${queryKey}` : path;

    // If node already exists, update its data
    if (this.nodes.has(uniquePath)) {
      const existingNode = this.nodes.get(uniquePath)!;
      existingNode.data.frequency++;
      existingNode.data.lastAccessed = new Date();
      Object.assign(existingNode.data.params, params);
      Object.assign(existingNode.data.queryParams, queryParams);
      return existingNode;
    }

    // Find parent node
    const parentNode = fromPath
      ? this.nodes.get(fromPath) || this.root
      : this.root;

    // Create new node
    const newNode = this.createNode(path, parentNode);
    newNode.data.params = params;
    newNode.data.queryParams = queryParams;

    // Add to parent's children if not already present
    if (!parentNode.children.some((child) => child.path === uniquePath)) {
      parentNode.children.push(newNode);
    }

    // Add to nodes map with uniquePath as the key
    this.nodes.set(uniquePath, newNode);

    return newNode;
  }

  getNode(path: string): RouteNode | undefined {
    return this.nodes.get(path);
  }

  getChildren(path: string): RouteNode[] {
    return this.nodes.get(path)?.children || [];
  }

  getParent(path: string): RouteNode | null {
    return this.nodes.get(path)?.parent || null;
  }

  findPathBetween(fromPath: string, toPath: string): string[] | null {
    const startNode = this.nodes.get(fromPath);
    const endNode = this.nodes.get(toPath);

    if (!startNode || !endNode) return null;

    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (current: RouteNode): boolean => {
      visited.add(current.path);
      path.push(current.path);

      if (current.path === toPath) {
        return true;
      }

      for (const child of current.children) {
        if (!visited.has(child.path)) {
          if (dfs(child)) {
            return true;
          }
        }
      }

      path.pop();
      return false;
    };

    return dfs(startNode) ? path : null;
  }

  toJSON(): any {
    const serializeNode = (node: RouteNode): any => ({
      path: node.path,
      data: node.data,
      children: node.children.map((child) => serializeNode(child)),
    });

    return serializeNode(this.root);
  }

  findSimilarRoutes(path: string): RouteNode[] {
    const targetNode = this.nodes.get(path);
    if (!targetNode) return [];

    const similar: RouteNode[] = [];
    const targetSegments = path.split("/").filter(Boolean);

    this.nodes.forEach((node) => {
      if (node.path === path) return;

      const nodeSegments = node.path.split("/").filter(Boolean);
      if (nodeSegments.length === targetSegments.length) {
        let differences = 0;
        for (let i = 0; i < nodeSegments.length; i++) {
          if (nodeSegments[i] !== targetSegments[i]) differences++;
        }
        if (differences <= 2) similar.push(node);
      }
    });

    return similar;
  }

  getRouteMetrics(): {
    totalRoutes: number;
    maxDepth: number;
    averageChildren: number;
    mostFrequentRoutes: RouteNode[];
  } {
    let maxDepth = 0;
    let totalChildren = 0;
    const routesByFrequency = Array.from(this.nodes.values()).sort(
      (a, b) => b.data.frequency - a.data.frequency,
    );

    this.nodes.forEach((node) => {
      maxDepth = Math.max(maxDepth, node.data.depth);
      totalChildren += node.children.length;
    });

    return {
      totalRoutes: this.nodes.size,
      maxDepth,
      averageChildren: totalChildren / this.nodes.size,
      mostFrequentRoutes: routesByFrequency.slice(0, 10),
    };
  }

  // Get all paths that match a certain pattern
  findRoutesByPattern(pattern: RegExp): RouteNode[] {
    return Array.from(this.nodes.values()).filter((node) =>
      pattern.test(node.path),
    );
  }

  // Analyze path parameters
  analyzePathParameters(): Map<string, Set<string>> {
    const parameterValues = new Map<string, Set<string>>();

    this.nodes.forEach((node) => {
      Object.entries(node.data.params).forEach(([param, value]) => {
        if (!parameterValues.has(param)) {
          parameterValues.set(param, new Set());
        }
        parameterValues.get(param)!.add(value);
      });
    });

    return parameterValues;
  }

  public toSerializable(): any {
    const serializeNode = (
      node: RouteNode,
      visitedNodes: Set<RouteNode>,
    ): any => {
      if (visitedNodes.has(node)) {
        return { ref: node.path }; // Reference existing node
      }

      visitedNodes.add(node);

      return {
        path: node.path,
        data: node.data,
        children: node.children.map((child) =>
          serializeNode(child, visitedNodes),
        ),
        parentPath: node.parent?.path || null, // Replace parent reference with path
      };
    };

    const visitedNodes = new Set<RouteNode>();
    return serializeNode(this.root, visitedNodes);
  }
}
