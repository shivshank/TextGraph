/* TODO:
    * allow canvas/viewer to not be full screen (mouse pos must be handled
        properly)
    * refactor editing handler
    * fix: double clicking a text input breaks it
    * polish undo/redo support (glitch on redo make link)
    * add help menus
    * context menu?
    * replace icon font with svg icons?
    * keyboard navigation and movement
    * scaling?
 */
(function(viewer, $, undefined){
    var create = function() {
        var o = Object.create(this);
        o.__init__.apply(o, arguments);
        return o;
    };
    
    var makeEditable = function(element, event, selector,
                                inputClass, useTextArea, cb) {
        // the event handlers will access these variables
        var input, old, unfocusEvent;
        
        // create the input
        if (useTextArea) {
            input = $("<textarea>");
        } else {
            input = $("<input>");
        }
        
        if (inputClass) {
            input.addClass(inputClass);
        }
        
        // create the unfocus event
        unfocusEvent = function(e) {
            var text = input.val();
            // restore the old element but dont update it
            input.replaceWith(old);
            // old.text(text);
            
            // call the user callback with the new text
            if (cb) {
                cb(text, old.text(), old);
            }
        };
        
        // attach the main handler
        $(element).on(event, selector, function(e) {
            e.stopPropagation();
            
            old = $(e.target);
            
            old.replaceWith(input);
            input.val(old.text());
            input.focus();
            input.select();
            
            input.on("focusout", unfocusEvent);
        });
    };
    
    viewer.create = create;
    viewer.__init__ = function(graph, viewer, canvas) {
        this.graph = graph;
        // a map of graph nodes to viewer data
        this.nodes = {};
        
        this.state = {
            dragging: false,
            selected: null,
            prevPos: {x: 0, y:0},
            linking: null
        };
        
        this.camera = {x: 0, y: 0};
        this.history = [];
        this.historyIndex = 0;
        this.historyBuffer = 100;
        
        // empty the viewer to make it clear that this object takes control
        this.viewer = viewer;
        this.viewer.empty();
        
        this.canvas = canvas;
        this.ctx = canvas[0].getContext("2d");
        
        // attach callbacks
        this.graph.on("addNode", this._addNode, this);
        this.graph.on("removeNode", this._removeNode, this);
        this.graph.on("addLink", this._addLink, this);
        this.graph.on("removeLink", this._removeLink, this);
        this.graph.on("empty", this._empty, this);
        this.graph.on("editNode", this._updateNode, this);
        
        var that = this;
        // load whatever is already in the graph
        this.graph.eachNode( function(n) {
            that.addNode(graph, n);
        });
        
        // attach all the jQuery events!
        this._attachEvents();
        
        // technically drawn will always be called in _attachEvents by the
        // canvas resize, but this makes it clear that the canvas MUST be drawn
        // once to guarantee the right styles are set on the canvas
        this.draw();
    };
    viewer._attachEvents = function() {
        // make canvas fill the parent
        $(window).on("resize", function() {
            this.canvas[0].width = this.canvas.width();
            this.canvas[0].height = this.canvas.height();
            this.draw();
        }.bind(this)).trigger("resize");
        
        // make the node bodies and headers editable
        // (update the graph object in the callbacks)
        // (let the graph object callback do the render update)
        makeEditable(this.viewer, "dblclick", ".node-body",
                     "node-body", true,
            function(txt, oldText, element) {
                var id = this.getIdFromHTML(element);
                this.graph.editNodeContent(id, txt);
                this.makeHistory("editNode", id, {
                    "new": txt,
                    "old": oldText
                });
            }.bind(this)
        );
        
        makeEditable(this.viewer, "dblclick", ".node-header > span", "", false,
            function(txt, oldText, element) {
                var id = this.getIdFromHTML(element);
                this.graph.editNodeName(id, txt);
                this.makeHistory("renameNode", id, {
                    "new": txt,
                    "old": oldText
                });
            }.bind(this)
        );
        // dblclicking anywhere on the header should also trigger this event
        this.viewer.on( "dblclick", ".node-header", function(e) {
            if (!$(e.target).hasClass(".node-header")) {
                // return if the user clicked on a child
                // (prevents double-triggering of anything)
            }
            $(e.target).children(0).trigger("dblclick");
        });
        
        // make the camera movable and the nodes dragable
        this.viewer.on( "mousedown", function(e) {
            if ($(e.target).is(".node *, .node")) {
                this.selectNode(this.getIdFromHTML(e.target));
            } else {
                this.deselectNode();
            }
            
            this._beginDragging(e);
        }.bind(this));

        this.viewer.on( "mouseup", function(e) {
            this._endDragging();
        }.bind(this));
        
        this.viewer.on( "mousemove", function(e) {
            // get the diff and update the state
            var diff = {
                x: e.pageX - this.state.prevPos.x,
                y: e.pageY - this.state.prevPos.y
            };
            this.state.prevPos.x = e.pageX;
            this.state.prevPos.y = e.pageY;
            
            if (!this.state.dragging) {
                return;
            }
            
            
            if (this.state.selected !== null) {
                // dragging a node
                this.translateNode(this.state.selected, diff.x, diff.y);
            } else {
                // dragging the camera
                this.translateCamera(-diff.x, -diff.y);
            }
            
        }.bind(this));
        
        $(document).on("keypress", function(e) {
            var userTyping = $(document.activeElement).is("input, textarea");
            
            if (this.controls[e.key]) {
                this.controls[e.key].call(this, e, userTyping);
            }
        }.bind(this));
    };
    /*
        This function is called whenever the user does something.
     */
    viewer.makeHistory = function(action, graphItem, meta) {
        this.history.splice(0, this.historyIndex);
        this.historyIndex = 0;
        
        // insert at the front of the list
        this.history.splice(0, 0, {
            "action": action,
            "item": graphItem,
            "meta": meta
        });
        
        // (could technically do one splice, but that's a little clever)
    };
    viewer.undo = function() {
        var action;
        if (this.historyIndex >= this.historyBuffer ||
            this.historyIndex >= this.history.length) {
            console.log("nothing to undo");
            return;
        }
        
        action = this.history[this.historyIndex];
        this.historyIndex += 1;
        
        switch (action.action) {
        case "addNode":
            this.graph.removeNode(action.item.id);
            break;
        case "removeNode":
            this.graph.loadNode(action.item);
            this.placeNode(action.item.id,
                          action.meta.pos.x, action.meta.pos.y);
            action.meta.links.forEach(function(i) {
                this.graph.loadLink(i);
            }.bind(this));
            break;
        case "addLink":
            this.graph.removeLink(action.item.from, action.item.to);
            break;
        case "removeLink":
            this.graph.loadLink(action.item);
            break;
        case "editNode":
            this.graph.editNodeContent(action.item, action.meta.old);
            break;
        case "renameNode":
            this.graph.editNodeName(action.item, action.meta.old);
            break;
        default:
            console.log("cannot undo this action", action);
        }
    };
    viewer.redo = function() {
        var action;
        if (this.historyIndex <= 0) {
            console.log("nothing to redo");
            return;
        }
        
        this.historyIndex -= 1;
        action = this.history[this.historyIndex];
        
        switch (action.action) {
        case "addNode":
            this.graph.loadNode(action.item);
            this.placeNode(action.item.id, 
                           action.meta.pos.x, action.meta.pos.y);
            break;
        case "removeNode":
            this.graph.removeNode(action.item.id);
            break;
        case "addLink":
            this.graph.loadLink(action.item);
            break;
        case "removeLink":
            this.graph.removeLink(action.item.from, action.item.to);
            break;
        case "editNode":
            this.graph.editNodeContent(action.item, action.meta["new"]);
            break;
        case "renameNode":
            this.graph.editNodeName(action.item, action.meta["new"]);
            break;
        default:
            console.log("cannot redo this action", action);
        }
    };
    viewer.selectNode = function(id) {
        this.deselectNode();
        
        this.state.selected = id;
        this.getHTMLNodeById(id).addClass("selected");
    };
    viewer.deselectNode = function() {
        var sel = this.state.selected;
        if (sel !== null) {
            this.getHTMLNodeById(sel).removeClass("selected");
        }
        this.state.selected = null;
    };
    viewer._beginDragging = function(evt) {
        this.state.dragging = true;
        
        this.state.prevPos = {
            x: evt.pageX,
            y: evt.pageY
        };
        
        if (this.state.selected === null) {
            this.viewer.css("cursor", "grabbing");
        }
    };
    viewer._endDragging = function() {
        this.state.dragging = false;
        
        this.viewer.css("cursor", "auto");
    };
    // "this" should be properly set to the viewer in the callbacks
    viewer._addNode = function(g, n) {
        var viewNode = this.createHTMLNode(n);
        this.viewer.append(viewNode);
        this.nodes[n.id] = {};
        
        this.placeNode(n.id, (this.viewer.width() - 150) * Math.random(),
                                  (this.viewer.height() - 150) * Math.random());
    };
    viewer._addLink = function(g, l) {
        this._drawLink(l);
    };
    viewer._empty = function(g) {
        this.viewer.empty();
        this.nodes = {};
        this.camera = {x: 0, y:0};
        
        this.draw();
    };
    viewer._updateNode = function(g, n) {
        var div = this.getHTMLNodeById(n.id);
        div.find(".node-header > span").text(n.name);
        div.find(".node-body").text(n.content);
        
        this.draw();
    };
    viewer._removeLink = function(g, l) {
        // viewer doesnt actually store any state related to links
        this.draw();
    };
    viewer._removeNode = function(g, n) {
        delete this.nodes[n.id];
        this.getHTMLNodeById(n.id).remove();
        this.draw();
    };
    viewer.placeNode = function(id, x, y) {
        this.nodes[id].x = x;
        this.nodes[id].y = y;
        
        // we have to redraw everything in case this node has links
        this.draw();
    };
    viewer.translateNode = function(id, x, y) {
        this.nodes[id].x += x;
        this.nodes[id].y += y;
        
        this.draw();
    };
    viewer._drawNode = function(id) {
        var n = this.getHTMLNodeById(id);
        
        n.css(this.getNodePosInCameraSpace(id));
    };
    viewer.getNodePosInCameraSpace = function(id) {
        return {
            "left": Math.floor(this.nodes[id].x - this.camera.x),
            "top": Math.floor(this.nodes[id].y - this.camera.y)
        };
    };
    viewer.getPosInWorldSpace = function(x, y) {
        return {
            x: x + this.camera.x,
            y: y + this.camera.y
        };
    };
    viewer._drawLink = function(l) {
        var from = this.getHTMLNodeById(l.from),
            to = this.getHTMLNodeById(l.to),
            fromPoint = {},
            toPoint = {},
            ltrSign, arrowSize;
        
        // assume left to right (ltr) ordering of from towards to
        fromPoint.y = parseFloat(from.css("top")) + from.outerHeight()/2;
        fromPoint.x = parseFloat(from.css("left")) + from.outerWidth();
        
        toPoint.y = parseFloat(to.css("top")) + to.outerHeight()/2;
        toPoint.x = parseFloat(to.css("left"));
        
        // if not left to right, swap which edge of the node the point is on
        if (toPoint.x < fromPoint.x) {
            fromPoint.x -= from.outerWidth();
            toPoint.x += to.outerWidth();
        }
        ltrSign = Math.sign(toPoint.x - fromPoint.x);
        
        this.ctx.beginPath();
        this.ctx.moveTo(fromPoint.x, fromPoint.y);
        this.ctx.bezierCurveTo(fromPoint.x + 100 * ltrSign, fromPoint.y,
                               toPoint.x - 100 * ltrSign, toPoint.y,
                               toPoint.x, toPoint.y);
        this.ctx.stroke();
        
        // draw a dot at the from point
        this.ctx.beginPath();
        this.ctx.arc(fromPoint.x, fromPoint.y, 5, 0, 6.3);
        this.ctx.fill();
        
        // draw an arrow at the to point (arrow size is factor * lineWidth)
        arrowSize = 2.7 * this.ctx.lineWidth;
        this.ctx.beginPath();
        this.ctx.moveTo(toPoint.x, toPoint.y);
        this.ctx.lineTo(toPoint.x - arrowSize * ltrSign, toPoint.y - arrowSize);
        this.ctx.lineTo(toPoint.x - arrowSize * ltrSign, toPoint.y + arrowSize);
        this.ctx.fill();
    };
    viewer._drawGrid = function(gridSize) {
        var x, y;
        gridSize = gridSize || 125;
        
        this.ctx.save();
        
        this.ctx.strokeStyle = "rgba(50, 50, 50, 0.5)";
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for(x = -this.camera.x % gridSize; x < this.canvas[0].width;
            x+= gridSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas[0].height);
        }
        
        for(y = -this.camera.y % gridSize; y < this.canvas[0].height;
            y+= gridSize) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas[0].width, y);
        }
        this.ctx.stroke();
        this.ctx.restore();
        
        if (arguments.length === 0) {
            this._drawGrid(gridSize/2);
        }
    };
    viewer.renameNode = function(id) {
        // TODO: refactor the whole editing event thing
        this.getHTMLNodeById(id).find(".node-header").trigger("dblclick");
    };
    viewer.editNodeContent = function(id) {
        // TODO: refactor the whole editing event thing
        this.getHTMLNodeById(id).find(".node-body").trigger("dblclick");
    };
    viewer.translateCamera = function(x, y) {
        this.camera.x += x;
        this.camera.y += y;
        this.draw();
    };
    viewer.draw = function() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas[0].width, this.canvas[0].height);
        
        this.ctx.strokeStyle = "#267";
        this.ctx.lineWidth = 3;
        this.ctx.fillStyle = "#267";
        
        this._drawGrid();
        
        Object.keys(this.nodes).forEach( function(id) {
            this._drawNode(id);
        }.bind(this));
        
        this.graph.eachLink( function(l) {
            this._drawLink(l);
        }.bind(this));
    };
    viewer.getHTMLNodeById = function(id) {
        return this.viewer.find(".node[id=viewer-node-" + id + "]").eq(0);
    };
    viewer.getIdFromHTML = function(element) {
        var id;
        element = $(element);
        
        if (!element.is(".node *, .node")) {
            throw "Element is not a descendant of a node, " + element[0];
        }
        
        while(!element.hasClass("node")) {
            element = element.parent();
        }
        
        id = element.prop("id");
        id = id.split("-");
        return parseInt(id[id.length - 1], 10);
    };
    viewer.createHTMLNode = function(n) {
        var main = $("<div>").addClass("node");
        main.append( $("<div>").text(n.name).addClass("node-header") )
            .append( $("<pre>").text(n.content).addClass("node-body") )
            .prop("id", "viewer-node-" + n.id);
        
        // the makeEditable event will need an element to replace,
        //   but we dont want to replace the whole div
        main.find(".node-header").wrapInner("<span>");
        return main;
    };
    viewer.beginLink = function() {
        if (this.state.selected === null) {
            return;
        }
        
        this.getHTMLNodeById(this.state.selected).addClass("linking");
        this.state.linking = this.state.selected;
    };
    viewer.createLink = function() {
        this.getHTMLNodeById(this.state.linking).removeClass("linking");
        
        if (this.state.selected === null ||
            this.state.selected === this.state.linking) {
            this.state.linking = null;
            return;
        }
        
        this.graph.connect(this.state.linking, this.state.selected);
        this.state.linking = null;
    };
    viewer.breakLink = function() {
        this.getHTMLNodeById(this.state.linking).removeClass("linking");
        
        if (this.state.selected === null || this.state.linking === null) {
            return;
        }
        
        this.graph.removeLink(this.state.linking, this.state.selected);
        this.state.linking = null;
    };
    viewer.removeSelectedNode = function() {
        var n, id;
        if (this.state.selected === null) {
            return;
        }
        
        id = this.state.selected;
        n = this.graph.getNodeById(id);
        
        this.makeHistory("removeNode", n, {
            pos: this.nodes[id],
            links: this.graph.getLinks(id)
        });
        this.graph.removeNode(n.id);
    };
    viewer.controls = {
        "a": function(e, typing) {
            if (typing) {
                return;
            }
            
            var n, id, pos;
            id = this.graph.addNode("", "");
            n = this.graph.getNodeById(id);
            pos = this.getPosInWorldSpace(this.state.prevPos.x - 75,
                                          this.state.prevPos.y - 5);
            this.placeNode(id, pos.x, pos.y);
            this.selectNode(id);
            
            this.makeHistory("addNode", n, {pos: this.nodes[id]});
        },
        "x": function(e, typing) {
            if (typing) {
                return false;
            }
            
            this.removeSelectedNode();
        },
        "z": function(e, typing) {
            if (typing) {
                return;
            }
            this.undo();
        },
        "y": function(e, typing) {
            if (typing) {
                return;
            }
            this.redo();
        },
        "Tab": function(e, typing) {
            e.preventDefault();
            
            var active = $(document.activeElement);
            if (typing) {
                active.trigger("focusout");
                return;
            }
            
            if (this.state.selected !== null) {
                this.editNodeContent(this.state.selected);
            }
        },
        "r": function(e, typing) {
            if (typing) {
                return;
            }
            
            if (this.state.selected !== null) {
                this.renameNode(this.state.selected);
            }
        },
        "l": function(e, typing) {
            if (typing) {
                return;
            }
            
            if (this.state.linking === null) {
                this.beginLink();
            } else {
                this.createLink();
            }
        },
        "u": function(e, typing) {
            if (typing) {
                return;
            }
            
            if (this.state.linking === null) {
                return;
            }
            
            this.breakLink();
        }
    };
    
}(window.viewer = window.viewer || {}, jQuery));