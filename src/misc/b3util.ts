import { useWorkspace } from "@/contexts/workspace-context";
import { NodeArgType, NodeModel, TreeGraphData, TreeModel } from "@/misc/b3type";
import * as fs from "fs";
import { message } from "./hooks";
import i18n from "./i18n";
import Path from "./path";
import { zhNodeDef } from "./template";

export const isSubtreeRoot = (data: TreeGraphData) => {
  return data.path && data.id.toString() !== "1";
};

export const isSubtreeUpdated = (data: TreeGraphData) => {
  if (data.path) {
    try {
      const subtreePath = useWorkspace.getState().workdir + "/" + data.path;
      if (fs.statSync(subtreePath).mtimeMs !== data.lastModified) {
        return true;
      }
    } catch (error) {
      return true;
    }
  }
  if (data.children) {
    for (const child of data.children) {
      if (isSubtreeUpdated(child)) {
        return true;
      }
    }
  }
  return false;
};

export const isNodeEqual = (node1: NodeModel, node2: NodeModel) => {
  if (
    node1.name === node2.name &&
    node1.desc === node2.desc &&
    node1.path === node2.path &&
    node1.debug === node2.debug &&
    node1.disabled === node2.disabled
  ) {
    const def = useWorkspace.getState().getNodeDef(node1.name);

    for (const arg of def.args ?? []) {
      if (node1.args?.[arg.name] !== node2.args?.[arg.name]) {
        return false;
      }
    }

    if (def.input?.length) {
      for (let i = 0; i < def.input.length; i++) {
        if (node1.input?.[i] !== node2.input?.[i]) {
          return false;
        }
      }
    }

    if (def.output?.length) {
      for (let i = 0; i < def.output.length; i++) {
        if (node1.output?.[i] !== node2.output?.[i]) {
          return false;
        }
      }
    }

    return true;
  }
  return false;
};

export const checkNodeData = (data: NodeModel | null | undefined) => {
  if (!data) {
    return false;
  }
  let hasError = false;
  const conf = useWorkspace.getState().getNodeDef(data.name);
  if (conf.input) {
    for (let i = 0; i < conf.input.length; i++) {
      if (conf.input[i].indexOf("?") === -1 && !data.input?.[i]) {
        console.error(`check ${data.id}|${data.name}: intput field '${conf.input[i]}' is required`);
        hasError = true;
      }
    }
  }
  if (conf.output) {
    for (let i = 0; i < conf.output.length; i++) {
      if (conf.output[i].indexOf("?") === -1 && !data.output?.[i]) {
        console.error(
          `check ${data.id}|${data.name}: output field '${conf.output[i]}' is required`
        );
        hasError = true;
      }
    }
  }
  if (conf.args) {
    for (let i = 0; i < conf.args.length; i++) {
      const arg = conf.args[i];
      if (arg.type.indexOf("?") === -1) {
        const type = arg.type as NodeArgType;
        const value = data.args?.[arg.name];
        if (type === "float") {
          if (typeof value !== "number") {
            console.error(`check ${data.id}|${data.name}: '${arg.name}' must be a number`);
            hasError = true;
          }
        } else if (type === "int") {
          if (typeof value !== "number" || value !== Math.floor(value)) {
            console.error(`check ${data.id}|${data.name}: '${arg.name}' must be a int`);
            hasError = true;
          }
        } else if (type === "string") {
          if (!value || typeof value !== "string") {
            console.error(`check ${data.id}|${data.name}: '${arg.name}' must be a string`);
            hasError = true;
          }
        } else if (type === "enum") {
          if (!arg.options?.find((option) => option.value === value)) {
            console.error(
              `check ${data.id}|${data.name}: '${arg.name}' must be one of option value`
            );
            hasError = true;
          }
        } else if (type == "code") {
          if (!value || typeof value !== "string") {
            console.error(`check ${data.id}|${data.name}: '${arg.name}' must be a string`);
            hasError = true;
          }
        }
      }
    }
  }

  if (data.children) {
    for (const child of data.children) {
      if (!checkNodeData(child)) {
        hasError = true;
      }
    }
  }

  return !hasError;
};

export const copyFromNode = (data: TreeGraphData, node: NodeModel) => {
  data.name = node.name;
  data.debug = node.debug;
  data.disabled = node.disabled;
  data.desc = node.desc;
  data.path = node.path;
  data.args = node.args;
  data.input = node.input;
  data.output = node.output;
};

const parsingStack: string[] = [];

export const createNode = (data: TreeGraphData, includeChildren: boolean = true) => {
  const node: NodeModel = {
    id: Number(data.id),
    name: data.name,
    desc: data.desc,
    path: data.path,
    debug: data.debug,
    disabled: data.disabled,
  };
  if (data.input) {
    node.input = [];
    for (const v of data.input) {
      node.input.push(v ?? "");
    }
  }
  if (data.output) {
    node.output = [];
    for (const v of data.output) {
      node.output.push(v ?? "");
    }
  }
  if (data.args) {
    node.args = {};
    for (const k in data.args) {
      const v = data.args[k];
      if (v !== null && v !== undefined) {
        node.args[k] = v;
      }
    }
  }
  if (data.children && !isSubtreeRoot(data) && includeChildren) {
    node.children = [];
    for (const child of data.children) {
      node.children.push(createNode(child));
    }
  }
  return node;
};

export const refreshTreeDataId = (data: TreeGraphData, id?: number) => {
  if (!id) {
    id = 1;
  }
  data.id = (id++).toString();
  if (data.children) {
    data.children.forEach((child) => {
      child.parent = data.id;
      id = refreshTreeDataId(child, id);
    });
  }
  return id;
};

export const calcTreeDataSize = (data: TreeGraphData) => {
  let height = 50 + 2;
  const updateHeight = (obj: any) => {
    if (Array.isArray(obj) || (obj && Object.keys(obj).length > 0)) {
      const { str, line } = toBreakWord(`参数:${JSON.stringify(obj)}`, 35);
      height += 20 * line;
    }
  };
  if (data.path) {
    height += 20;
  }
  updateHeight(data.args);
  updateHeight(data.input);
  updateHeight(data.output);
  return [220, height];
};

export const checkTreeData = (data: TreeGraphData) => {
  const conf = data.def;
  if (conf.input) {
    for (let i = 0; i < conf.input.length; i++) {
      if (conf.input[i].indexOf("?") === -1 && !data.input?.[i]) {
        return false;
      }
    }
  }
  if (conf.output) {
    for (let i = 0; i < conf.output.length; i++) {
      if (conf.output[i].indexOf("?") === -1 && !data.output?.[i]) {
        return false;
      }
    }
  }
  if (conf.args) {
    for (let i = 0; i < conf.args.length; i++) {
      const arg = conf.args[i];
      if (arg.type.indexOf("?") === -1) {
        const type = arg.type as NodeArgType;
        const value = data.args?.[arg.name];
        if (type === "float") {
          if (typeof value !== "number") {
            return false;
          }
        } else if (type === "int") {
          if (typeof value !== "number" || value !== Math.floor(value)) {
            return false;
          }
        } else if (type === "string") {
          if (!value || typeof value !== "string") {
            return false;
          }
        } else if (type === "enum") {
          if (!arg.options?.find((option) => option.value === value)) {
            return false;
          }
        } else if (type === "code") {
          if (!value || typeof value !== "string") {
            return false;
          }
        }
      }
    }
  }

  return true;
};

export const createTreeData = (node: NodeModel, parent?: string) => {
  const workspace = useWorkspace.getState();
  let treeData: TreeGraphData = {
    id: node.id.toFixed(),
    name: node.name,
    desc: node.desc,
    args: node.args,
    input: node.input,
    output: node.output,
    debug: node.debug,
    disabled: node.disabled,
    def: workspace.getNodeDef(node.name),
    parent: parent,
  };

  treeData.size = calcTreeDataSize(treeData);

  if (!parent) {
    parsingStack.length = 0;
  }

  if (node.children) {
    treeData.children = [];
    node.children.forEach((child) => {
      treeData.children!.push(createTreeData(child, treeData.id));
    });
  } else if (node.path) {
    if (parsingStack.indexOf(node.path) >= 0) {
      treeData.path = node.path;
      treeData.size = calcTreeDataSize(treeData);
      message.error(`循环引用节点：${node.path}`, 4);
      return treeData;
    }
    parsingStack.push(node.path);
    try {
      const subtreePath = workspace.workdir + "/" + node.path;
      const str = fs.readFileSync(subtreePath, "utf8");
      treeData = createTreeData(JSON.parse(str).root, treeData.id);
      treeData.lastModified = fs.statSync(subtreePath).mtimeMs;
      treeData.path = node.path;
      treeData.debug = node.debug;
      treeData.disabled = node.disabled;
      treeData.parent = parent;
      treeData.id = node.id.toFixed();
      treeData.size = calcTreeDataSize(treeData);
    } catch (error) {
      message.error(`解析子树失败：${node.path}`);
      console.log("parse subtree:", error);
    }
    parsingStack.pop();
  }
  calcTreeDataSize(treeData);
  return treeData;
};

export const createBuildData = (path: string) => {
  try {
    const str = fs.readFileSync(path, "utf8");
    const treeModel = JSON.parse(str);
    const data = createTreeData(treeModel.root);
    refreshTreeDataId(data);
    treeModel.root = createFileData(data, true);
    return treeModel as TreeModel;
  } catch (error) {
    console.log("build error:", path, error);
  }
  return null;
};

export const createFileData = (data: TreeGraphData, includeSubtree?: boolean) => {
  const nodeData: NodeModel = {
    id: Number(data.id),
    name: data.name,
    desc: data.desc || undefined,
    args: data.args || undefined,
    input: data.input || undefined,
    output: data.output || undefined,
    debug: data.debug || undefined,
    disabled: data.disabled || undefined,
    path: data.path || undefined,
  };
  if (data.children?.length && (includeSubtree || !isSubtreeRoot(data))) {
    nodeData.children = [];
    data.children.forEach((child) => {
      nodeData.children!.push(createFileData(child, includeSubtree));
    });
  }
  return nodeData;
};

export const createNewTree = (filename: string) => {
  const tree: TreeModel = {
    name: Path.basenameWithoutExt(filename),
    root: {
      id: 1,
      name: "Sequence",
    },
  };
  return tree;
};

const isAsciiChar = (c: number) => {
  return (c >= 0x0001 && c <= 0x007e) || (0xff60 <= c && c <= 0xff9f);
};

const isUppercase = (c: number) => {
  return c >= 0x0041 && c <= 0x005a;
};

export const toBreakWord = (str: string, maxlen: number) => {
  const chars: string[] = [];
  let line = 1;
  let len = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    len += isAsciiChar(c) ? (isUppercase(c) ? 1.5 : 1) : 2;
    chars.push(String.fromCharCode(c));
    if (len >= maxlen && i < str.length - 1) {
      len = 0;
      line++;
      chars.push("\n");
    }
  }
  return {
    str: chars.join(""),
    line,
  };
};

export const cutWordTo = (str: string, maxlen: number) => {
  let i = 0;
  for (; i < str.length; i++) {
    const c = str.charCodeAt(i);
    maxlen -= isAsciiChar(c) ? (isUppercase(c) ? 1.5 : 1) : 2;
    if (maxlen <= 0) {
      break;
    }
  }
  return str.slice(0, i) + (i < str.length - 1 ? "..." : "");
};

export const createProject = (path: string) => {
  fs.writeFileSync(Path.dirname(path) + "/node-config.b3-setting", zhNodeDef());
  fs.writeFileSync(
    Path.dirname(path) + "/example.json",
    JSON.stringify(
      {
        name: "example",
        root: {
          id: 1,
          name: "Sequence",
          children: [
            {
              id: 2,
              name: "Log",
              args: {
                str: "hello",
              },
            },
            {
              id: 3,
              name: "Wait",
              args: {
                time: 1,
              },
            },
          ],
        },
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path,
    JSON.stringify(
      {
        nodeConf: "node-config.b3-setting",
        metadata: [],
      },
      null,
      2
    )
  );
};
