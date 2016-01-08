# TextGraph
Here is a library and associated editor for a directed graph of text nodes.

See textgraph.js for the main library.

The viewer.js file contains the code for the viewer, see main.html for it's usage.

The viewer automatically binds certain hotkeys:
  * a is add node
  * x is delete node
  * z is undo
  * y is redo
  * tab toggles editing the main body
  * l is link
  * u is unlink

Linking a node is a little convoluted. Pressing l while a node is selected enters link mode. Pressing l while a second node is selected joins the first node to the second node. To break a link, press l while on the first node and u while the second node is selected.

Every node has a name that you can edit by double clicking the header. The graph object is called "g" and can be converted by its export method. You can do this from the console or else from the viewer if font awesome is provided. Graphs can be loaded from JSON via the load method.