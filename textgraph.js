(function(graph, undefined){
    var create = function() {
        var o = Object.create(this);
        o.__init__.apply(o, arguments);
        return o;
    };
    
    graph.create = create;
    graph.__init__ = function() {
        this.openIds = [];
        this.nextId = 0;
        
        this.links = [];
        this.nodes = {};
        
        this.callbacks = {
            "addNode": [],
            "removeNode": [],
            "addLink": [],
            "removeLink": [],
            "empty": [],
            "editNode": []
        };
    };
    graph.empty = function() {
        this.nodes = {};
        this.links = [];
        this.openIds = [];
        
        this.fire("empty", [this]);
    };
    graph.load = function(g) {
        if (typeof g === "string") {
            g = JSON.parse(g);
        }
        
        g.links.forEach(function(i) {
            this.connect(i.from, i.to);
        }.bind(this));
        
        // should really properly convert every ID to an int... this is messy
        var ids = Object.keys(g.nodes),
            m = Math.max.apply(null, 
                               ids.map(function(i){return parseInt(i, 10);})),
            i, n;

        this.nextId = m + 1;
        this.openIds = [];
        
        for(i=0; i < m; i+=1) {
            if (ids.indexOf(i.toString()) === -1) {
                this.openIds.push(parseInt(i, 10));
            }
        }
        
        for(i=0; i < ids.length; i+=1) {
            n = this._node.create(ids[i], g.nodes[ids[i]].name,
                                  g.nodes[ids[i]].content);
            n.data = g.nodes[ids[i]].data;
            this.loadNode(n);
        }
    };
    graph.export = function() {
        var r = {
            links: [],
            nodes: {}
        };
        
        this.eachLink( function(l) {
            r.links.push({
                from: l.from,
                to: l.to
            });
        });
        
        this.eachNode( function(n) {
            r.nodes[n.id] = {
                name: n.name,
                content: n.content,
                data: n.data
            };
        });
        
        return r;
    };
    graph.fire = function(callbackType, args) {
        if (!this.callbacks[callbackType]) {
            throw "Callback type does not exist, " + callbackType;
        }
        
        var i, arr = this.callbacks[callbackType];
        for(i=0; i < arr.length; i+=1) {
            arr[i].func.apply(arr[i].ctx, args);
        }
    };
    graph.on = function(callbackType, func, thisObject) {
        if (!this.callbacks[callbackType]) {
            throw "Callback type does not exist, " + callbackType;
        }
        
        this.callbacks[callbackType].push({func: func, ctx: thisObject});
    };
    graph.getNextId = function() {
        if (this.openIds.length > 0) {
            return this.openIds.pop();
        }
        
        this.nextId += 1;
        return this.nextId - 1;
    };
    graph.addNode = function(name, content) {
        var n = this._node.create(this.getNextId(), name, content);
        this.nodes[n.id] = n;
        
        this.fire("addNode", [this, n]);
        
        return n.id;
    };
    /*
        Remove a node. Also removes relevant links.
            * DOES NOT fire removeLink handlers.
            * Fires removeNode handler.
     */
    graph.removeNode = function(id) {
        var i, status,
            n = this.nodes[id],
            links = this.getLinks(id);
        
        for (i=0; i < this.links.length; i+=1) {
            if (this.links[i].to === id || this.links[i].from === id) {
                this.links.splice(i, 1);
                i -= 1;
            }
        }
        
        delete this.nodes[id];
        this.openIds.push(id);
        
        this.fire("removeNode", [this, n, links]);
    };
    graph.eachNode = function(cb) {
        var i, keys = Object.keys(this.nodes);
        for(i=0; i < keys.length; i+=1) {
            if (cb(this.nodes[keys[i]]) === false) {
                break;
            };
        }
    };
    graph.editNode = function(id, newName, newContent) {
        var n = this.nodes[id];
        if (!n) {
            throw "Node ID does not exist, " + id;
        }
        
        n.editName(newName);
        n.editContent(newContent);
        
        this.fire("editNode", [this, n]);
    };
    graph.editNodeName = function(id, newName) {
        var n = this.nodes[id];
        if (!n) {
            throw "Node ID does not exist, " + id;
        }
        n.editName(newName);
        
        this.fire("editNode", [this, n]);
    };
    graph.editNodeContent = function(id, newContent) {
        var n = this.nodes[id];
        if (!n) {
            throw "Node ID does not exist, " + id;
        }
        n.editContent(newContent);
        
        this.fire("editNode", [this, n]);
    };
    graph.connect = function(from, to) {
        if (typeof from !== "number" && typeof to !== "number") {
            from = from.id;
            to = to.id;
        }
        
        if (this.getLink(from, to)) {
            return;
        }
        
        var l = this._link.create(from, to);
        this.links.push(l);
        
        this.fire("addLink", [this, l]);
    };
    graph.removeLink = function(from, to) {
        var i, link;
        for (i=0; i < this.links.length; i+=1) {
            if (this.links[i].to === to && this.links[i].from === from) {
                link = this.links.splice(i, 1)[0];
                break;
            }
        }
        
        this.fire("removeLink", [this, link]);
    };
    graph.getLink = function(from, to) {
        if (typeof from !== "number" && typeof to !== "number") {
            from = from.id;
            to = to.id;
        }
        
        var i;
        for (i=0; i < this.links.length; i+=1) {
            if (this.links[i].from === from && this.links[i].to === to) {
                return this.links[i];
            }
        }
        
        return null;
    };
    graph.eachLink = function(cb) {
        var i;
        for(i=0; i < this.links.length; i+=1) {
            if (cb(this.links[i]) === false) {
                break;
            };
        }
    };
    graph.getLinks = function(id) {
        return this.links.filter( function(i) {
            return i.to === id || i.from === id;
        });
    };
    graph.loadNode = function(n) {
        var i;
        if (this.nodes[n.id]) {
            throw "A node already exists with this id, " + n.id;
        }
        this.nodes[n.id] = n;
        
        i = this.openIds.indexOf(n.id);
        if (i !== -1) {
            this.openIds.splice(i, 1);
        }
        
        this.fire("addNode", [this, n]);
    };
    graph.loadLink = function(l) {
        this.links.push(l);
        
        this.fire("addLink", [this, l]);
    };
    graph.getNodeById = function(id) {
        return this.nodes[id];
    };
    
    graph._node = {
        create: create,
        __init__: function(id, name, content) {
            this.id = parseInt(id, 10);
            this.name = name.toString();
            this.content = content.toString();
            this.data = {};
        },
        edit: function(newName, newContent) {
            this.editName(newName);
            this.editContent(newContent);
        },
        editName: function(newName) {
            this.name = newName;
        },
        editContent: function(newContent) {
            this.content = newContent;
        }
    };
    
    graph._link = {
        create: create,
        __init__: function(from, to) {
            this.from = from;
            this.to = to;
        }
    };
    
}(window.textgraph = window.textgraph || {}));