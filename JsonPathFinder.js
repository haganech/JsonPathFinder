
class JsonPathFinder {
    constructor() {}
    
    find(rootObj, nestedPathStringArray = [], returnSingle = true, returnIfError = undefined, separator = '/'){
        if ((typeof nestedPathStringArray) == "string"){
            nestedPathStringArray = [nestedPathStringArray];
        }

        let all_matched_obj = [];

        for (const nestedPathString of nestedPathStringArray){
            try{
                const current_obj = this._tryNestedObjRecur([rootObj], this._splitTerm(nestedPathString, separator), separator);
                if (current_obj != null && current_obj != undefined && current_obj.length > 0){
                    if (returnSingle == true){
                        return current_obj[0];
                    }else{
                        all_matched_obj.push(...current_obj);
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

    _tryNestedObjRecur(rootObjects, nestedObjects, separator, orig = true, counter = 0){
        if (nestedObjects.length > 0){
            // console.log(rootObjects, nestedObjects)
            let newObjects = [];
            for (const rootObject of rootObjects){
                try{
                    if (nestedObjects[0] == "" && nestedObjects.length > 1){
                        // in wildcard & vartical search
                        // if (Object.keys(rootObject) != '0'){
                        //     console.log(Object.keys(rootObject), nestedObjects[1])
                        //     if (nestedObjects.length == 1){
                        //         console.log(this._evaluateCondition(rootObject, nestedObjects[1], separator))
                        //     }
                        // }

                        const objs = this._evaluateCondition(rootObject, nestedObjects[1], separator);
                        if(objs){
                            newObjects.push(...objs);
                        }
                        if(this.isDict(rootObject)){
                            for (const k of Object.keys(rootObject)){
                                newObjects.push(...this._tryNestedObjRecur([rootObject[k]], nestedObjects.slice(0,2), separator, false, counter+1));
                            }
                        }else if (rootObject instanceof Array){
                            newObjects.push(...this._tryNestedObjRecur(rootObject, nestedObjects.slice(0,2), separator, false, counter+1));
                        }
                    }else if(nestedObjects[0] == "."){
                        newObjects.push(rootObject);
                    }else{
                        const objs = this._evaluateCondition(rootObject, nestedObjects[0], separator);
                        if(objs){
                            newObjects.push(...objs);
                        }
                    }
                }catch(e){
                    console.warn(e)
                }
            }

            if (nestedObjects.length == 1){
                return newObjects;
            }else if (nestedObjects.length > 1){
                if (nestedObjects[0] == ""){
                    if (nestedObjects.length == 2){
                        return newObjects;
                    }else if (nestedObjects.length > 2){
                        return (newObjects.length > 0)? this._tryNestedObjRecur(newObjects, nestedObjects.slice(2), separator, orig, counter+10) : newObjects;
                    }
                }else{
                    if (nestedObjects.length > 1){
                        return (newObjects.length > 0)? this._tryNestedObjRecur(newObjects, nestedObjects.slice(1), separator, orig, counter+10) : newObjects;
                    }
                }
            }
        }else{
            return rootObjects
        }
    }


    _evaluateCondition(orig_obj, token, separator = '/'){
        
        const regex_main = /^([-_A-Za-z0-9*]+)(\[[ ]*(.+)[ ]*\]|)$/
        const regex_primitive_number_value = [
            /([ =]+|^)([-0-9.]+)([ =]+|$)/
        ]
        const regex_primitive_string_value = [
            /[ ]*"([^"]+)"[ ]*/,
            /[ ]*'([^']+)'[ ]*/
        ]
        const regex_primitive_operator_value = [
            "="
        ]
        const regex_exression = [
            new RegExp("^[ ]*(<\\$[A-Z][0-9]+>)[ ]*([" + regex_primitive_operator_value.join("") + "]+)[ ]*(<\\$[A-Z][0-9]+>)$[ ]*"),
        ]

        if (token.match(regex_main)){
            const key = token.match(regex_main)[1];
            let targets = [];
            if (this.isDict(orig_obj) && key in orig_obj){
                targets.push(orig_obj[key]);
            }else if (this.isDict(orig_obj) && key == "*"){
                for (let k of Object.keys(orig_obj)){
                    targets.push(orig_obj[k]);
                }
            }else if (orig_obj instanceof Array && key == "*"){
                for (let v of orig_obj){
                    targets.push(v);
                }
            }else{
                return null;
            }

            if (token.match(regex_main)[3]){
                const filtered_result = []
                for (let v of targets){
                    let object_store = {};  // <$N0>, <$N1>, <$N2> ...   <$S0>, <$S1>, <$S2> ...  <$E0>, <$E1>, <$E2> ...  
                    let condition = token.match(regex_main)[3].toString();
    
                    condition = this._replaceTerm(condition, object_store, separator)
                    
                    for (const k of Object.keys(object_store)){
                        const res = this._tryNestedObjRecur([v], this._splitTerm(object_store[k]), separator, false, -100);
                        object_store[k] = (res && res.length > 0)? res[0] : res;
                    }

                    for (const r of regex_primitive_string_value){
                        let hit_array;
                        while ((hit_array = (new RegExp(r)).exec(condition)) !== null) {
                            let seq = Object.keys(object_store).join("").match(/S/g)? Object.keys(object_store).join("").match(/S/g).length: 0;
                            let temp_condition = condition.split("")
                            object_store[`<$S${seq+1}>`] = hit_array[1];
                            temp_condition.splice(r.lastIndex - hit_array[0].length, hit_array[0].length, `<$S${seq+1}>`).join("")
                            condition = temp_condition.join("")
                        }
                    }
    
                    for (const r of regex_primitive_number_value){
                        let hit_array;
                        while ((hit_array = (new RegExp(r)).exec(condition)) !== null) {
                            let seq = Object.keys(object_store).join("").match(/N/g)? Object.keys(object_store).join("").match(/N/g).length: 0;
                            let temp_condition = condition.split("")
                            object_store[`<$N${seq+1}>`] = temp_condition.splice(r.lastIndex - hit_array[2].length, hit_array[2].length, `<$N${seq+1}>`).join("");
                            condition = temp_condition.join("")
                        }
                    }
                    
                    for (const r of regex_exression){
                        let hit_array;
                        while ((hit_array = (new RegExp(r)).exec(condition)) !== null) {
                            let seq = Object.keys(object_store).join("").match(/E/g)? Object.keys(object_store).join("").match(/E/g).length: 0;
                            let temp_condition = condition.split("")
                            if (hit_array[2] == "="){
                                object_store[`<$E${seq+1}>`] = (object_store[hit_array[1]] == object_store[hit_array[3]])
                            }else{
                                // object_store[`<$E${seq+1}>`] = hit_array[1], hit_array[2].length, `<$E${seq+1}>`).join("");
                            }
                            temp_condition.splice(r.lastIndex - hit_array[0].length, hit_array[0].length, `<$E${seq+1}>`).join("");
                            condition = temp_condition.join("")
                        }
                    }
    
                    if (condition.match(/^[ ]*(<\$[A-Z][0-9]+>)[ ]*$/)){
                        if (object_store[condition.match(/^[ ]*(<\$[A-Z][0-9]+>)[ ]*$/)[0]]){
                            filtered_result.push(v);
                        }
                    }
                    
                    // console.log(condition)
                    // console.log(object_store)
                }

                if (filtered_result.length > 0){
                    return filtered_result;
                }else {
                    return null;
                }
            }else{
                return targets;
            }
        }else{
            return null;
        }
    }
    
    _splitTerm(path, separator = '/'){
        path = this.trim(path);
        let count_bracket = 0;  // []
        let quote = undefined;      // ""''
        let stack_token_string = "";
        let result = [];
        for(let i = 0; i < path.length; i++){
            let c = path[i];
            if (c.match(/["']/)){
                if (quote == ""){
                    quote = c;
                }else{
                    quote = (quote == c)? undefined : quote;
                }
                stack_token_string = stack_token_string + c;
            }else if (c.match(/\[/)){
                if(quote == undefined){
                    count_bracket = count_bracket + 1;
                }
                stack_token_string = stack_token_string + c;
            }else if (c.match(/\]/)){
                if(quote == undefined){
                    if (count_bracket > 0){
                        count_bracket = count_bracket - 1;
                    }
                }
                stack_token_string = stack_token_string + c;
                if (quote == undefined && count_bracket == 0 && stack_token_string != "" && i+1 >= path.length){
                    result.push(stack_token_string);
                    stack_token_string = "";
                }
            }else if (c.match(new RegExp("[" + this._escape(separator) + "]"))){
                if (quote == undefined && count_bracket == 0){
                    if(stack_token_string != ""){
                        result.push(stack_token_string);
                        stack_token_string = "";
                    }

                    if(i+1 < path.length && path[i+1].match(new RegExp("[" + this._escape(separator) + "]"))){
                        result.push("")
                        i++;
                    }
                }else{
                    stack_token_string = stack_token_string + c;
                }
            }else{
                stack_token_string = stack_token_string + c;
                if (quote == undefined && count_bracket == 0 && stack_token_string != "" && i+1 >= path.length){
                    result.push(stack_token_string);
                    stack_token_string = "";
                }
            }
        }

        return result;
    }

    _replaceTerm(path, object_store, separator = '/'){
        let seq_t = Object.keys(object_store).join("").match(/T/g)? Object.keys(object_store).join("").match(/T/g).length: 0;
        let count_bracket = 0;  // []
        let quote = undefined;      // ""''
        let starting_num = undefined;
        for(let i = 0; i < path.length; i++){
            let c = path[i];
            if (c.match(/["']/)){
                if (quote == ""){
                    quote = c;
                }else{
                    quote = (quote == c)? undefined : quote;
                }
            }else if (c.match(/\[/)){
                if(quote == undefined){
                    count_bracket = count_bracket + 1;
                }
            }else if (c.match(/\]/)){
                if(quote == undefined){
                    if (count_bracket > 0){
                        count_bracket = count_bracket - 1;
                    }

                    if (quote == undefined && count_bracket == 0 && starting_num != undefined && (i+1 >= path.length || path[i+1].match(/[ =<>()]/))){
                        let temp_path = path.split("")
                        let temp_seq_t = seq_t++;
                        object_store[`<$T${temp_seq_t}>`] = temp_path.splice(starting_num, i-starting_num+1, `<$T${temp_seq_t}>`).join("");
                        i = starting_num;
                        path = temp_path.join("")
                        starting_num = undefined;
                    }
                }
            }else if (c.match(new RegExp("[." + this._escape(separator) + "]"))){
                starting_num = (starting_num == undefined)? i : starting_num;
                if (quote == undefined && count_bracket == 0 && starting_num != undefined && (i+1 >= path.length || path[i+1].match(/[ =<>()]/))){
                    let temp_path = path.split("")
                    let temp_seq_t = seq_t++;
                    object_store[`<$T${temp_seq_t}>`] = temp_path.splice(starting_num, i-starting_num+1, `<$T${temp_seq_t}>`).join("");
                    i = starting_num;
                    path = temp_path.join("")
                    starting_num = undefined;
                }
            }else{
                if (quote == undefined && count_bracket == 0 && starting_num != undefined && (i+1 >= path.length || path[i+1].match(/[ =<>()]/))){
                    let temp_path = path.split("")
                    let temp_seq_t = seq_t++;
                    object_store[`<$T${temp_seq_t}>`] = temp_path.splice(starting_num, i-starting_num+1, `<$T${temp_seq_t}>`).join("");
                    i = starting_num;
                    path = temp_path.join("")
                    starting_num = undefined;
                }
            }
        }

        return path;
    }

    _escape(str){
        return str.replace("/", "\\/").replace("\\", "\\\\")
    }
    isDict(v) {
        return typeof v==='object' && v!==null && !(v instanceof Array) && !(v instanceof Date);
    }
    trim(str){
        return str.toString().replaceAll(/^[ 　\t\n\r]+/g, "").replaceAll(/[ 　\t\n\r]+$/g, "");
    }
}

export { JsonPathFinder };