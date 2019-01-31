Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    itemId: 'rallyApp',
    items: [
        {
            xtype: 'container',
            itemId: 'rootSurface',
            width: 1920,
            height: 1080,
            margin: '5 5 5 5',
            layout: 'auto',
            autoEl: {
                tag: 'svg'
            },
            listeners: {
                afterrender:  function() {  gApp = this.up('#rallyApp'); gApp._onElementValid(this);},
            }
        }
    ],

    _appendGETPromise: function(mt) {

        var deferred = Ext.create('Deft.Deferred');
        var fieldList ='Name,Parent,ElementName,DisplayName';
        var service = Rally.util.Ref.getUrl(this.getContext().getWorkspace()._ref);
        Ext.Ajax.request(
            {
                url: service.substring(0, service.lastIndexOf('/workspace/')) + mt + '?fetch=' + fieldList,
                method: "GET",
                scope: this,
                success: function(response) {
                    deferred.resolve(response);
                },
                failure: function(error) {
                    deferred.reject(error);
                }
            }
        );
        return deferred.promise;
    },
    
    _createRoot: function(nodes) {
        var root = d3.stratify()
            .id( function(d) {
                return d.Name;
            })
            .parentId( function(d) { 
                return (d.data && d.data.Parent && d.data.Parent.ElementName);
            })
            (nodes);
        return root;
    },

    _setSVGSize: function(rs){
        var svg = d3.select('svg');
        svg.attr('width', rs.getEl().dom.clientWidth);
        svg.attr('height',rs.getEl().dom.clientHeight);
    },

    _drawTree: function(root) {
        var svg = d3.select('svg');

        //Apply the tree calc function to the nodes
        //With the sideways spider diagram, reverse the dimensions
        d3.cluster()
            .size([svg.attr('height'), svg.attr('width') - 250])
            (root);

        var treeCanvas = svg.append('g')
                .attr('id','tree')
                .attr('transform', 'translate(25,0)');

        //Save these for later (when we want to turn them on/off)
        gApp.links = treeCanvas.selectAll(".link")
            .data(root.descendants().slice(1))
            .enter().append("path")
            .attr("class", 'link')
            .attr("d", function(d) {
                    return "M" + d.y + "," + d.x +
                         "C" + (d.parent.y + 100) + "," + d.x +
                         " " + (d.parent.y + 100) + "," + d.parent.x +
                         " " + d.parent.y + "," + d.parent.x;
            });
        
        var nodes = treeCanvas.selectAll(".node")
            .data(root.descendants())
            .enter().append('g')
            .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

        nodes.append('circle')
            .attr('r', 5)
            .attr('class', 'circle');

        nodes.append('text')
            .attr('class', 'text')
            .attr('x' , 10)
            .attr('y', 0)
            .style('text-anchor', 'start')
            .text(function(d) {
                return d.data.Description;
            });
    },

    launch: function() {
    },

    _onElementValid(rootSurface)
    {

        //Sync the svg system with the Ext one
        gApp._setSVGSize(rootSurface);

        //Find the version of WSAPI and append to string

        //Get the whole set of TypeDefinitions
        Ext.create('Rally.data.wsapi.Store', {
            model: 'TypeDefinition',
            autoLoad: true,
            listeners: {
                load: function (store,data,success) {
                
                    console.log('Loaded ' + data.length + ' typedefs');
                    if (success) {
                        var nodes = [];
                        
                        //Push them into an array we can reconfigure
                        _.each(data, function(record) {
                            nodes.push({'Name': record.get('ElementName'), 'data': record.data, 'Description': record.get('DisplayName') });
                        });

                        //Scan looking for missing (abstract) ones and fetch those directly
                        var abstractTypes = [];
                        _.each(nodes, function (node) {
                            if ( undefined === _.find( nodes, { 'Name': node.data.Parent.ElementName})){
                                abstractTypes.push(node.data.Parent._ref);
                            }
                        });
                        abstractTypes = _.uniq(abstractTypes);

                        var getAll =[];
                        _.each(abstractTypes, function (mt) {
                            getAll.push(gApp._appendGETPromise(mt));
                        });

                        Deft.Promise.all(getAll).then({
                            success: function(results) {
                                _.each(results, function(result) {
                                    //We will have the responseText as a JSON string. Parse this to an object and add to the node array
                                    var data = Ext.JSON.decode(result.responseText).TypeDefinition;
                                    nodes.push( {
                                        Name: data.ElementName,
                                        data: data,
                                        Description: data.DisplayName
                                    });
                                });

                                gApp._drawTree(gApp._createRoot(nodes));
                            }
                        });
                    }
                }
            }
        });
    }
});
