import { NodeModel, TreeModel } from "@/misc/b3type";


/* example
%% 节点配置
-record(b3t,
     {     
        id                      %% id     
        , type = 0              %% 节点类型     
        , parent = 0            %% 父节点     
        , child = []            %% 子节点 [node_id,...] 如果是权重节点 [{node_id, weight},...]     
        , input = false         %% 输入     
        , condition = []        %% 条件     
        , spec_condition = []   %% 特殊条件     
        , action = []           %% 运行 
}).
**/

/*
-module(b3t).
-include("wg_log.hrl").
-export([get/1]).
get(10000)->{b3t,1000,0,[1001,1002],....};
get(10001)->{b3t,1000,0,[1001,1002],....};
get(10002)->{b3t,1000,0,[1001,1002],....};
get(_ID0) -> ?ERROR("===========>配置表数据不存在，策划检查下配置！！！id=~p", [_ID0]), throw({error, b3t, can_not_find_id, _ID0 ,erlang:process_info(self(), current_stacktrace)}).
**/

function toTuple(object: { [key: string]: any }) {
    if (!object) {
        return '[]';
    }
    let tuple = [];
    for (const key in object) {
        tuple.push(`{${key},${object[key]}}`)
    }
    return `[${tuple.join(",")}]`;
}

export default function json2Erlang(treeModel: TreeModel): string {
    let res = `-module(b3t).
-include("wg_log.hrl").
-export([get/1]).
`;
    // 1. 展开JSON

    let array: NodeModel[] = [];

    function readNode(node: NodeModel, parent?: NodeModel) {
        node.parent = parent
        array.push(node)
        if (node.children) {
            node.children.forEach(child => {
                readNode(child, node)
            })
        }
    }
    readNode(treeModel.root)

    /* 
        id                      %% id     
        , type = 0              %% 节点类型     
        , parent = 0            %% 父节点     
        , child = []            %% 子节点 [node_id,...] 如果是权重节点 [{node_id, weight},...]     
        , input = false         %% 输入     
        , condition = []        %% 条件     
        , spec_condition = []   %% 特殊条件     
        , action = []           %% 运行 
    **/
    // [{key,val},{}]




    for (let index = 0; index < array.length; index++) {
        const node = array[index];
        let args = [
            node.id,                        // id
            node.name.toLowerCase(),                      // 节点类型 
            node.parent?.id || 0,                // 父节点 
            (node.children && node.children.length > 0) ? `[${node.children.map(c => c.id).join(',')}]` : '[]',  // 子节点 [node_id,...] 如果是权重节点 [{node_id, weight},...]    
            node.input || false,                     // 输入
            toTuple(node.args!),                      // 条件
            false,                              // 特殊条件 
            false,                              // 运行 
        ]
        let str = `get(${node.id})->{b3t,${args.join(',')}};\n`;
        res += str;
    }

    res += 'get(_ID0) -> ?ERROR("===========>配置表数据不存在，策划检查下配置！！！id=~p", [_ID0]), throw({error, b3t, can_not_find_id, _ID0 ,erlang:process_info(self(), current_stacktrace)}).'

    return res;
}