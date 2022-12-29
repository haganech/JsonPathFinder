
class JsonPathFinder {
    constructor() {}
    
    find(rootObj, nestedPathStringArray = [], returnSingle = true, returnIfError = undefined, separator = '/'){
        if ((typeof nestedPathStringArray) == "string"){
            nestedPathStringArray = [nestedPathStringArray];
        }

        let all_matched_obj = [];

        for (const nestedPathString of nestedPathStringArray){
            try{
                let [path_parsed, object_store] = this._splitToken(nestedPathString);
                // console.log(path_parsed)
                // console.log(object_store)
                const current_objs = this._resolveToken(rootObj, [rootObj], path_parsed, object_store, separator);
                if (current_objs != null && current_objs != undefined && current_objs instanceof Array && current_objs.length > 0){
                    if (returnSingle == true){
                        return current_objs[0][current_objs[0].length -1];
                    }else{
                        for (const current_obj of current_objs){
                            all_matched_obj.push(current_obj[current_obj.length -1]);
                        }
                    }
                }
            }catch(e){
                console.warn(e)
            }
        }

        if(all_matched_obj.length > 0){
            return all_matched_obj
        }else{
            // console.warn(JSON.stringify(nestedPathStringArray) + " was not found in")
            // console.warn(rootObj)
            return returnIfError;
        }
    }

    _splitToken(path_original, object_store = {}, separator = '/'){
        let path_parsed = this._escape(path_original)

        const regex_tokens = [
            {
                regex: /(?:[^0-9A-Za-z_#]+|^)([-]{0,1}[0-9]+[.]{0,1}[0-9]*)(?:[^0-9A-Za-z_#]+|$)/,  // -1234.5
                prefix: "N",
                type: "number",
                resolve: (root, object_tree, value, object_store, separator) => {
                    return Number(value.replace(/[^-0-9.]/g, ""));
                }
            },
            {
                regex: /[ ]*("[^"]+")[ ]*/,     // "any text"
                prefix: "S",
                type: "string",
                resolve: (root, object_tree, value, object_store, separator) => {
                    return this._unescape(value.toString().replace(/^"/, "").replace(/"$/, ""));
                }
            },
            {
                regex: /[ ]*('[^']+')[ ]*/,     // 'any text'
                prefix: "S",
                type: "string",
                resolve: (root, object_tree, value, object_store, separator) => {
                    return this._unescape(value.toString().replace(/^'/, "").replace(/'$/, ""));
                }
            },
            {
                regex: /(?:[^A-Za-z$\/.]|^)(([.\/]*[A-Za-z*][A-Za-z0-9]*)(\/[A-Za-z*]*[A-Za-z0-9]*)*)/,     // //a1/a2/*/a4//b1
                prefix: "P",
                type: "path_simple",
                resolve: (root, object_tree, value, object_store, separator) => {
                    return this._resolvePath(root, object_tree, value, object_store, separator);
                }
            },
            {
                regex: /(?:[^A-Za-z$\/.]|^)([A-Za-z.\/][^\[\]<>= (),]+\[<\$[BCMP][0-9]+>\])/,   // //a1/a2[./b4 = 'test']
                prefix: "P",
                type: "path_with_condition",
                resolve: (root, object_tree, value, object_store, separator) => {
                    let [orig, path, condition_tag] = value.match(/([^\[ ]+)[ ]*\[[ ]*([^\] ]+)[ ]*\]/);
                    let candidates = this._resolvePath(root, object_tree, path, object_store, separator);
                    let candidates_after_condition = [];
                    for (const candidate of candidates){
                        const res = this._resolveToken(root, candidate, condition_tag, object_store, separator)
                        if (this._resolveConditionValue(res) == true){
                            candidates_after_condition.push(candidate)
                        }
                    }
                    return candidates_after_condition;
                }
            },
            {
                regex: /(?:[^A-Za-z$\/.]|^)(<\$[BP][0-9]+>\[<\$[BCMP][0-9]+>\])/,   // <$P1>[<$C1>]
                prefix: "P",
                type: "path_with_condition_tag",
                resolve: (root, object_tree, value, object_store, separator) => {
                    let [orig, path_tag, condition_tag] = value.match(/([^\[ ]+)[ ]*\[[ ]*([^\] ]+)[ ]*\]/);
                    let candidates = this._resolveToken(root, object_tree, path_tag, object_store, separator);
                    let candidates_after_condition = [];
                    for (const candidate of candidates){
                        const res = this._resolveToken(root, candidate, condition_tag, object_store, separator)
                        if (res === true || res.length > 0){
                            candidates_after_condition.push(candidate)
                        }
                    }
                    return candidates_after_condition;
                }
            },
            {
                regex: /(?:[^A-Za-z$\/.]|^)((<\$[AP][0-9]+>){2,})/,
                prefix: "P",
                type: "path_list",
                resolve: (root, object_tree, value, object_store, separator) => {
                    return this._resolveToken(root, object_tree, value, object_store, separator);
                }
            },
            {
                regex: /(?:[^A-Za-z$\/.]|^)(<\$[PB][0-9]+>\[<\$[N][0-9]+>\])/,  // /a/b/c[2]
                prefix: "A",
                type: "array",
                resolve: (root, object_tree, value, object_store, separator) => {
                    let [orig, path_tag, order_tag] = value.match(/(<\$[PB][0-9]+>)\[(<\$[N][0-9]+>)\]/);
                    let candidates = this._resolveToken(root, object_tree, path_tag, object_store, separator);
                    let order_num = Number(this._resolveToken(root, object_tree, order_tag, object_store, separator)) -1;
                    let new_candidates = []
                    for (const candidate of candidates){
                        const current_object = candidate[candidate.length -1];
                        if (current_object instanceof Array && current_object.length > order_num && current_object[order_num]){
                            let new_ancester = candidate.slice();
                            new_ancester.push(current_object[order_num]);
                            new_candidates.push(new_ancester)
                        }else if(order_num == 0 && (current_object instanceof Array) == false && current_object != null){
                            new_candidates.push(candidate);
                        }
                    }
                    return new_candidates;
                }
            },
            {
                regex: /([A-Za-z_][A-Za-z0-9_]*[ ]*\([^\(\)]+\))/,      //  contains(./a, 'aaa')
                prefix: "M",
                type: "method",
                resolve: (root, object_tree, value, object_store, separator) => {
                    let [orig, method_name, method_arg] = value.match(/([A-Za-z_][A-Za-z0-9_]*)[ ]*\(([^\(\)]+)\)/);
                    let args = [];
                    for (const _args of method_arg.split(",")){
                        args.push(this._resolveToken(root, object_tree, this.trim(_args), object_store, separator));
                    }
                    method_name = method_name.toLowerCase();

                    const methods = {
                        "contains": (args)=>{
                            if (args.length >= 2){
                                if (args[0].length > 0 && args[0][0].length > 0 && (typeof args[0][0][args[0][0].length - 1]) == 'string'){
                                    return args[0][0][args[0][0].length - 1].toString().includes(args[1].toString())
                                }
                            }else{
                                return null;
                            }
                        }
                    }

                    if (method_name in methods){
                        return methods[method_name](args);
                    }else{
                        return false;
                    }
                }
            },
            {
                regex: /(<\$[A-Z][0-9]+>[ ]*(?:=|<=|>=|<|>|!=)[ ]*<\$[A-Z][0-9]+>)/i,
                prefix: "C",
                type: "condition_first_priority",
                resolve: (root, object_tree, value, object_store, separator) => {
                    return this._resolveCondition(root, object_tree, value, object_store, separator);
                }
            },
            {
                regex: /(<\$[A-Z][0-9]+>[ ]*(?:and|or)[ ]*<\$[A-Z][0-9]+>)/i,
                prefix: "C",
                type: "condition_second_priority",
                resolve: (root, object_tree, value, object_store, separator) => {
                    return this._resolveCondition(root, object_tree, value, object_store, separator);
                }
            },
            {
                regex: /[ ]*(\([ ]*<\$[A-Z][0-9]+>[ ]*\))[ ]*/,
                prefix: "B",
                type: "block",
                resolve: (root, object_tree, value, object_store, separator) => {
                    let [orig, path_tag] = value.match(/\([ ]*(<\$[A-Z][0-9]+>)[ ]*\)/);
                    return this._resolveToken(root, object_tree, path_tag, object_store, separator);
                }
            },
        ]

        recur: for(let i=0; i<10; i++){
            let isHit = false;
            for (const regex_token of regex_tokens){
                let path_replaced = this._replaceToken(path_parsed, object_store, regex_token)
                if (path_parsed.toString() !== path_replaced.toString()){
                    path_parsed = path_replaced;
                    continue recur;
                }
            }
            break recur;
        }
        // console.log(path_parsed)
        // console.log(object_store)
        return [path_parsed, object_store]
    }
    
    _replaceToken(str, object_store, regex_obj){
        let hit_array;
        let r = new RegExp(regex_obj.regex, 'g');
        while ((hit_array = r.exec(str)) !== null) {
            if (regex_obj.type == 'method' && hit_array[1].match(/^(AND|OR)[^A-Za-z]+.*/i)){
                continue;
            }
            if (regex_obj.type.match('path') && hit_array[1].match(/^(AND|OR|CONTAINS).*/i)){
                continue;
            }
            // if(regex_obj.type == 'path_z'){
            //     console.log(hit_array[0])
            //     console.log(hit_array)
            // }
            let seq = this.iferror(()=>{ return Object.keys(object_store).join("").match(new RegExp(regex_obj.prefix, 'g')) }, "").length;
            let temp_str = str.split("")
            let tag = `<$${regex_obj.prefix}${seq+1}>`;
            object_store[tag] = {
                value: hit_array[1],
                type: regex_obj.type,
                resolve: regex_obj.resolve
            };
            const str_after_replace = hit_array[0].replace(hit_array[1], tag);
            temp_str.splice(r.lastIndex - hit_array[0].length, hit_array[0].length, str_after_replace);
            str = temp_str.join("")

            if (regex_obj.type.match('path_list')){
                let i = 0
                for (const _tag of hit_array[1].match(/<\$[A-Z][0-9]+>/g)){
                    if (i != 0){
                        let reversed_text = this._reverseObjectStore(_tag, object_store);
                        if (reversed_text.match(/^\/.*/)){
                            let [new_text, new_object_store] = this._splitToken("." + reversed_text, object_store);
                            object_store = new_object_store
                            object_store[_tag] = object_store[new_text];
                        }
                    }
                    i++;
                }
            }
        }
        return str;
    }

    _reverseObjectStore(path_parsed, object_store){
        // console.log("_reverseObjectStore")
        let _path_parsed = path_parsed;
        recur: for(let i=0; i<1000; i++){
            let isHit = false;
            for (const tag of Object.keys(object_store)){
                if(_path_parsed.match(tag.replace(/\$/g, "\\$"))){
                    _path_parsed = _path_parsed.replace(tag, object_store[tag].value)
                    continue recur;
                }
            }
            break recur;
        }
        return _path_parsed;
    }

    _resolveCondition(root, object_tree, value, object_store, separator = "/"){
        let [orig, v1_tag, operator, v2_tag] = value.match(/(<\$[A-Z][0-9]+>)[ ]*(=|<=|>=|<|>|!=|and|or)[ ]*(<\$[A-Z][0-9]+>)/i);
        let v1_raw = this._resolveToken(root, object_tree, v1_tag, object_store, separator);
        let v1 = v1_raw;
        if (v1_raw instanceof Array && v1_raw.length > 0){
            if (v1_raw[0] instanceof Array && v1_raw[0].length > 0){
                v1 = v1_raw[0][v1_raw[0].length - 1]
            }
        }
        let v2_raw = this._resolveToken(root, object_tree, v2_tag, object_store, separator);
        let v2 = v2_raw;
        if (v2_raw instanceof Array && v2_raw.length > 0){
            if (v2_raw[0] instanceof Array && v2_raw[0].length > 0){
                v2 = v2_raw[0][v2_raw[0].length - 1]
            }
        }

        if (operator.toLowerCase() == "="){
            return (v1 == v2);
        }else if (operator.toLowerCase() == "!="){
            return (v1 != v2);
        }else if (operator.toLowerCase() == "<"){
            return (v1 < v2);
        }else if (operator.toLowerCase() == ">"){
            return (v1 > v2);
        }else if (operator.toLowerCase() == "<="){
            return (v1 <= v2);
        }else if (operator.toLowerCase() == ">="){
            return (v1 >= v2);
        }else if (operator.toLowerCase() == "and"){
            return (this._resolveConditionValue(v1_raw) && this._resolveConditionValue(v2_raw))
        }else if (operator.toLowerCase() == "or"){
            return (this._resolveConditionValue(v1_raw) || this._resolveConditionValue(v2_raw))
        }else{
            return false;
        }
    }

    _resolveConditionValue(v1_raw){
        let v1 = v1_raw;
        if (v1_raw instanceof Array && v1_raw.length > 0){
            if (v1_raw[0] instanceof Array && v1_raw[0].length > 0){
                v1 = v1_raw[0][v1_raw[0].length - 1]
            }
        }
        
        if((v1_raw instanceof Array) && v1_raw.length > 0){
            return true
        }else if ((typeof v1) == 'boolean' && v1 === true){
            return true
        }else if ((typeof v1) == 'number' && v1 > 0){
            return true
        }else if ((typeof v1) == 'string' && v1.length > 0){
            return true
        }else{
            return false;
        }
    }

    _resolveToken(root, object_tree, path_parsed, object_store, separator = "/"){
        let result_objects = [object_tree];

        // console.log(object_store)
        // console.log(path_parsed)
        for (const tag of path_parsed.match(/<\$[A-Z][0-9]+>/g)){
            let new_candidates = [];
            for(const _object_tree of result_objects){
                // console.log(tag + " : " + object_store[tag].value + ", num_of_tree : " + object_tree.length)
                const res = object_store[tag].resolve(root, _object_tree, object_store[tag].value, object_store, separator)
                if (res instanceof Array){
                    new_candidates.push(...object_store[tag].resolve(root, _object_tree, object_store[tag].value, object_store, separator));
                }else{
                    new_candidates.push(res);
                }
                
            }
            result_objects = new_candidates;
        }

        if (result_objects.length == 1 && (result_objects[0] instanceof Array) == false && this.isDict(result_objects[0]) == false){
            return result_objects[0];
        }else{
            return result_objects;
        }
    }

    _resolvePath(root, object_tree, input_string, object_store, separator = "/"){
        let temp_input_string = input_string;
        temp_input_string = input_string.replace(/\.\.\//g, '<PARENT>/')
        temp_input_string = temp_input_string.replace(/^\/\//g, '<ROOT_RECUR>/')
        temp_input_string = temp_input_string.replace(/^\//g, '<ROOT>/')
        temp_input_string = temp_input_string.replace(/^\.(?:\/)/g, '<CURRENT>/')
        temp_input_string = temp_input_string.replace(/\/\//g, '/<RECUR>/')
        temp_input_string = temp_input_string.replace(/\*/g, '<WILDCARD>')
        let temp_input_tokens = temp_input_string.split(separator)

        let candidates = [
            object_tree.slice()
        ]

        for (let i=0; i<temp_input_tokens.length; i++){
            const temp_input_token = temp_input_tokens[i];
            // console.log("temp_input_token " + temp_input_token)
            let new_candidates = []
            candidate_loop: for (let candidate of candidates){
                if (temp_input_token == "<PARENT>"){
                    new_candidates.push(candidate.slice(0, candidate.length-1));
                    continue;
                }else if (temp_input_token == "<ROOT>"){
                    new_candidates = [[root]]
                    break candidate_loop;
                }else if (temp_input_token == "<ROOT_RECUR>"){
                    new_candidates.push(...this._searchPath([[root]], temp_input_tokens[i+1]))
                    break candidate_loop;
                }else if (temp_input_token == "<CURRENT>"){
                    new_candidates.push(candidate.slice());
                    continue;
                }else if (temp_input_token == "<RECUR>"){
                    new_candidates.push(...this._searchPath([candidate], temp_input_tokens[i+1]))
                }else if (temp_input_token == "<WILDCARD>"){
                    const current_object = candidate[candidate.length -1];
                    if(this.isDict(current_object)){
                        for (const k of Object.keys(current_object)){
                            let new_ancester = candidate.slice();
                            new_ancester.push(current_object[k]);
                            new_candidates.push(new_ancester)
                        }
                    }else if (current_object instanceof Array){
                        for (const v of current_object){
                            let new_ancester = candidate.slice();
                            new_ancester.push(v);
                            new_candidates.push(new_ancester)
                        }
                    }
                }else{
                    const current_object = candidate[candidate.length -1];
                    if (this.isDict(current_object) && (temp_input_token in current_object)){
                        let new_ancester = candidate.slice()
                        new_ancester.push(current_object[temp_input_token]);
                        new_candidates.push(new_ancester);
                    }
                }
            }
            // console.log(new_candidates)
            candidates = new_candidates;
            if (temp_input_token == "<RECUR>" || temp_input_token == "<ROOT_RECUR>"){
                i = i + 1;
            }
        }

        return candidates;
    }

    _searchPath(candidates, next_object_key){
        let result_candidates = []
        for (const candidate of candidates){
            const current_object = candidate[candidate.length - 1];
            if (this.isDict(current_object) && (next_object_key in current_object)){
                let new_ancester = candidate.slice();
                new_ancester.push(current_object[next_object_key]);
                result_candidates.push(new_ancester)
            }

            if(this.isDict(current_object)){
                let new_candidates = [];
                for (const k of Object.keys(current_object)){
                    let new_ancester = candidate.slice();
                    new_ancester.push(current_object[k]);
                    new_candidates.push(new_ancester)
                }
                result_candidates.push(...this._searchPath(new_candidates, next_object_key));
            }else if (current_object instanceof Array){
                let new_candidates = [];
                for (const v of current_object){
                    let new_ancester = candidate.slice();
                    new_ancester.push(v);
                    new_candidates.push(new_ancester)
                }
                result_candidates.push(...this._searchPath(new_candidates, next_object_key));
            }
        }
        return result_candidates;
    }


    _escape(str){
        let temp_str = str.replace(/\\\\/g, (matched)=>{
            return "<$#" + matched.charCodeAt(1) + ">";
        })
        temp_str = temp_str.replace(/\\./g, (matched)=>{
            return "<$#" + matched.charCodeAt(1) + ">";
        })
        return temp_str;
    }

    _unescape(str){
        return str.replace(/\<\$#([0-9]+)>/g, (matched, p1, offset)=>{
            console.log(matched)
            console.log(p1)
            console.log(offset)
            return "\\" + String.fromCharCode(Number(p1));
        })
    }

    isDict(v) {
        return typeof v==='object' && v!==null && !(v instanceof Array) && !(v instanceof Date);
    }
    trim(str){
        return str.toString().replaceAll(/^[ 　\t\n\r]+/g, "").replaceAll(/[ 　\t\n\r]+$/g, "");
    }
    iferror(closure, return_value_if_error){
        try{
            // console.log(closure)
            let result = closure();
            // console.log(result)
            if (result){
                return result;
            }else{
                return return_value_if_error;
            }
        }catch(e){
            // console.error(e)
            return return_value_if_error;
        }
    }
}

export { JsonPathFinder };

// let json = {
//     "a1": {
//         "a2": {
//             "a3": {
//                 "a4": "aaa"
//             }
//         },
//         "b2": {
//             "c1": "ccc",
//             "b3": [
//                 {},
//                 {
//                     "b4": "bbb",
//                     "a4": "aaa2"
//                 }
//             ]
//         }
//     }
// }

// console.log (new JsonPathFinder()._splitToken("(//subMenuItems/*[((./title)) = '\\\\Live chat \\\\replay']//continuation//continuation/conte/kl)[3]/tag1[./*[eca = 'aa']][2]/test[./oewa = 'abc' and contains (eda, 'eawea') and (12)]/eee1/eee2"))
// console.log(new JsonPathFinder().find(a, "/a1//b3[contains(./a4, 'a2') and ../c1 = 'ccc']"))

// import * as fs from 'fs';
// let text = fs.readFileSync("test.json");
// let json = JSON.parse(text);
// console.log(new JsonPathFinder().find(json, "//a4", false))

// let [text, store] = new JsonPathFinder()._splitToken("/a1//b3[contains(.//a4, 'a2') and ../c1 = 'ccc'][2]/b4")
// console.log(text)
// console.log(store)
// console.log(new JsonPathFinder()._reverseObjectStore(text, store))