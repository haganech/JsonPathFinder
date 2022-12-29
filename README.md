# JsonPathFinder
## What is this ?
This is the library to search the JSON element(s) / JavaScript with deep-nested object in Dictionary and Array using **XPath-like** syntax.  
Usually we use XPath to search the XML element but this library searches such element using similar way. [Introduction to using XPath in JavaScript - XPath | MDN](https://developer.mozilla.org/en-US/docs/Web/XPath/Introduction_to_using_XPath_in_JavaScript)

## How to use it
If there's this kind of JSON,
```json
{
    "a1": {
        "a2": {
            "a3": {
                "a4": "aaa"
            }
        },
        "b2": {
            "c1": "ccc",
            "b3": [
                {},
                {
                    "b4": "bbb",
                    "a4": "aaa2"
                }
            ]
        }
    }
}
```
Then you can search the object like this
```javascript
import * as fs from 'fs';
let text = fs.readFileSync("test.json");
let json = JSON.parse(text);
const result = new JsonPathFinder().find(json, "/a1//b3[contains(./a4, 'a2') and ../c1 = 'ccc']")
console.log(result)     // Output : "bbb"
```

### Child token hierarchy
```javascript
const result = new JsonPathFinder().find(json, "/a1/a2/a3/a4")
console.log(result)     // Output : "aaa"
```

### Wildcard
```javascript
const result = new JsonPathFinder().find(json, "/a1/*/a3/a4")
console.log(result)     // Output : "aaa"
```

### Multi-level wildcard
```javascript
const result = new JsonPathFinder().find(json, "/a1//a4")
console.log(result)     // Output : "aaa"
```

### Order in the array
```javascript
const result = new JsonPathFinder().find(json, "//b3[2]/b4")
console.log(result)     // Output : "bbb"
```

### Order in the array
```javascript
const result = new JsonPathFinder().find(json, "//b3[2]/b4")
console.log(result)     // Output : "bbb"
```

### Condition
```javascript
const result = new JsonPathFinder().find(json, "//c1[..//b4 = 'bbb']")
console.log(result)     // Output : "ccc"
```

### Get all available results (multiple result)
```javascript
console.log(new JsonPathFinder().find(json, "//b2/b3[2]/*", false))     // Output : [ 'bbb', 'aaa2' ]
console.log(new JsonPathFinder().find(json, "//a4", false))             // Output : [ 'aaa', 'aaa2' ]
```

### If the result is the object (not string) then, of-course it returns the object
```javascript
const result = new JsonPathFinder().find(json, "//a2")
console.log(result)     // Output : { a3: { a4: 'aaa' } }
```

And other detail, please refer to the general XPath syntax.