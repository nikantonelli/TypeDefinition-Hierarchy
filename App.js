

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    itemId: 'rallyApp',
    items: [
        {
            xtype: 'rallybutton',
            itemId: 'printPDF',
            text: 'PDF',
            handler: function() {
                gApp._printPDF();
            }
        },
        {
            xtype: 'container',
            itemId: 'rootSurface',
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

    config: {
        defaultSettings: {
            clusterDiag: false
        }
    },

    getSettingsFields: function() {
        return [
            {
                name: 'clusterDiag',
                xtype: 'rallycheckboxfield',
                fieldLabel: 'Use d3.cluster',
                labelAlign: 'top'
            }
        ];
    },

    _printPDF: function() {
        var svg = d3.select('svg');
        var pdf = new jsPDF('l', 'pt', [svg.attr('width'), svg.attr('height') ]);
        svg2pdf(svg.node(), pdf, {});
        pdf.save('typedef.pdf');
    },

    _appendGETPromise: function(mt, fieldList) {

        var deferred = Ext.create('Deft.Deferred');
        var service = Rally.util.Ref.getUrl(this.getContext().getWorkspace()._ref);
        if (mt.startsWith("https")) { service = '';}
        var options =  Ext.clone({
            url: service.substring(0, service.lastIndexOf('/workspace/')) + mt + '?fetch=' + encodeURIComponent(fieldList),
            method: "GET",
            scope: this,
            success: function(response) {
                console.log('resolved: ', response);
                deferred.resolve(response);
            },
            failure: function(error) {
                console.log('errored: ', error);
                deferred.reject(error);
            }
        });

        Ext.Ajax.request(options);
        return deferred.promise;
    },
    
    _createRoot: function(nodes) {
        var root = d3.stratify()
            .id( function(d) {
                return d.Name;
            })
            .parentId( function(d) { 
                return (d.data && d.data.Parent && d.data.Parent._ref.substring(d.data.Parent._ref.lastIndexOf('/typedefinition/')));
            })
            (nodes);
        return root;
    },

    _setSVGSize: function(){
        var svg = d3.select('svg');
        svg.attr('width', this.getEl().dom.clientWidth);
        svg.attr('height',this.getEl().dom.clientHeight - this.down('#printPDF').getEl().dom.clientHeight);
    },

    _drawTree: function(root) {
        console.log('Drawing tree');
        var svg = d3.select('svg');

        //Apply the tree calc function to the nodes
        //With the sideways spider diagram, reverse the dimensions
        var treetype = d3.tree().size([svg.attr('height'), svg.attr('width') - 250]);

        if (gApp.getSetting('clusterDiag')){
            treetype = d3.cluster().size([svg.attr('height'), svg.attr('width') - 250]);
        }
        treetype(root);

        var treeCanvas = svg.append('g')
                .attr('id','tree')
                .attr('transform', 'translate(25,0)');

        //Save these for later (when we want to turn them on/off)
        gApp.links = treeCanvas.selectAll(".link")
            .data(root.descendants().slice(1))
            .enter().append("path")
            .attr("fill", 'none')
            .attr('stroke' , '#83cbe4')
            .attr('stroke-width', '2px')
            .attr("d", function(d) {
                    return "M" + d.y + "," + d.x +
                         "C" + (d.parent.y + 100) + "," + d.x +
                         " " + (d.parent.y + 100) + "," + d.parent.x +
                         " " + d.parent.y + "," + d.parent.x;
            });
        
        var nodes = treeCanvas.selectAll(".node")
            .data(root.descendants())
            .enter().append('g')
            .attr('id', function(d) {
                return 'group' + d.data.Name;
            })
            .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

        nodes.append('circle')
            .attr('r', 5)
            .attr('class', 'circle')
            .on('mouseover', function(node,index, array) { gApp._nodeMouseOver(node, index, array);})
            .on('mouseout', function(node,index, array) { gApp._nodeMouseOut(node, index, array);});

        /* Prefetch the attributes in case we get to print later */
        nodes.each(gApp._fetchAttributes);

        nodes.append('text')
            .attr('font-size', '12px')
            .attr('font-family', "tahoma,geneva,helvetica,arial,sans-serif")
            .attr('x' , 10)
            .attr('y', 5)
            .attr('id', function(d) {
                return 'text' + d.data.Name;
            })
            .style('text-anchor', 'start')
            .text(function(d) {
                return d.data.Description;
            });
    },

    _createTable(node, data, fields) {
        var columnWidth = 200;
        var rowHeight = 20;
        var xOffset = 0;
        var yOffset = 0;

        data = _.sortBy(data, '_refObjectName');

        //We need to check whther we will overwrite off the side of the screen
        //Find out where 'g' is located
        var g = node.attributes;
        g.attr('visibility', 'hidden');

        //Get the size of SVG panel
        var svg = d3.select('svg');
        var canvasWidth = svg.attr('width');
        var canvasHeight = svg.attr('height');

        if (( (node.y + (fields.length * columnWidth)) > canvasWidth) && 
                ((node.y - (fields.length * columnWidth)) >= 0)) {
            xOffset = -1 * ( (fields.length * columnWidth) + 25);
        }

        if (( (node.x + (data.length * rowHeight)) > canvasHeight) && 
                ((node.x - (data.length * rowHeight)) >=0 )) {
            yOffset = -1 * ( node.x + (data.length * rowHeight) - canvasHeight);
        }

        //Draw title box
        g.append('rect')
            .attr('width', columnWidth * fields.length)
            .attr('height', rowHeight)
            .attr('transform', 'translate(' + xOffset + ','+(-rowHeight+yOffset)+')')
            .attr('class', 'tableTitle');

        g.append('text')
            .attr('transform', 'translate(' + (xOffset+((columnWidth * fields.length)/2)) + ','+(-(rowHeight*0.3)+yOffset)+')')
            .attr('class', 'titleText')
            .style('text-anchor', 'middle')
            .text( node.data.Description + ' Attributes');

        //Draw header blocks
        for ( var p = 0; p < fields.length; p++) {
            g.append('rect')
                .attr('width', columnWidth)
                .attr('height', rowHeight)
                .attr('x', (columnWidth * p) + xOffset)
                .attr('y', yOffset)
                .attr('class', 'tableHdrBlk');
            g.append('text')
                .attr('x',(columnWidth * p)+5+ xOffset)
                .attr('y', (rowHeight * 0.6) + yOffset)
                .text( fields[p].title)
                .attr('class', 'tableText');
        }

        for ( var j = 0; j < data.length; j++) {
            for ( var i = 0; i < fields.length; i++) {
                g.append('rect')
                    .attr('width', columnWidth)
                    .attr('height', rowHeight)
                    .attr('x', (columnWidth * i) + xOffset)
                    .attr('y', ((j+1) * rowHeight) + yOffset)
                    .attr('class', 'tableRowBlk');
                var tstring = data[j][fields[i].name];
                if ( 'object' === typeof data[j][fields[i].name]) {
                    tstring = data[j][fields[i].name] ? data[j][fields[i].name]._refObjectName : '';
                }
                g.append('text')
                    .attr('x',((columnWidth * i)+5) + xOffset)
                    .attr('y', (rowHeight * (j+1.6)) + yOffset)
                    .text(tstring)
                    .attr('class', 'tableText');
            }
    
        }
    },

    _nodeMouseOver: function(node) {
        if ( node.gotAttributes) {
            if (node.attributes) { node.attributes.attr("visibility","visible");}
        }
    },

    _fetchAttributes: function(node) {

        //For each attribute associated with this type, we need to know which ones relate to other types
        //in out hierarchy.
        var attribs = [];
        var fieldList = [
            { name: 'Name', title: 'Display Name'},
            { name: 'RealAttributeType', title: 'Attribute Type'},
            { name: 'ElementName', title: 'WSAPI Name'},
            { name: 'AllowedValueType', title: 'Element Type'}
        ];

        attribs.push(gApp._appendGETPromise(node.data.data.Attributes._ref, _.pluck(fieldList, 'name')));
        Deft.Promise.all(attribs).then( {
            success: function(results){
                console.log('Attribute fetch :', results);
                node.gotAttributes = true;
                var data = Ext.JSON.decode(results[0].responseText); //We only get one here so use [0]

                //So that we can overwrite on top of the graph, we need to add these on the svg element
                node.attributes = d3.select('svg').append('g')
                                        //'tree' is transformed to be 25 from left edge and then shift by further 20
                                        .attr('transform','translate(' + (node.y+25+20) + ',' + node.x + ')');
                gApp._createTable(node, data.QueryResult.Results, fieldList);
            },
            failure: function(arg) {
                console.log('Deft.Promise.all failed', arg);
            }
        });
    },

    _nodeMouseOut: function(node) {
        if ( node.gotAttributes) {
            if (node.attributes) { node.attributes.attr("visibility","hidden");}
        }
    },

    _onElementValid()
    {
        //Sync the svg system with the Ext one
        gApp._setSVGSize();

        //Get the whole set of TypeDefinitions
        Ext.create('Rally.data.wsapi.Store', {
            model: 'TypeDefinition',
            fetch: ['Name', 'ElementName','DisplayName', 'Attributes', 'Parent'],
            sorters: [
                {
                    property: 'Name',
                    direction: 'ASC'
                }
            ],
            autoLoad: true,
            listeners: {
                load: function (store,data,success) {
                    if (success) {
                        var nodes = [];
                        
                        //Push them into an array we can reconfigure
                        _.each(data, function(record) {
                            nodes.push({'Name': record.get('_ref'), 'data': record.data, 'Description': record.get('DisplayName') });
                        });

                        //Scan looking for missing (abstract) ones and fetch those directly
                        var abstractTypes = [];
                        _.each(nodes, function (node) {
                            if ( undefined === _.find( nodes, { 'Name': node.data.Parent._ref})){
                                abstractTypes.push(node.data.Parent._ref);
                            }
                        });
                        abstractTypes = _.uniq(abstractTypes);

                        var getAll =[];
                        _.each(abstractTypes, function (mt) {
                            var fieldList ='Name,Parent,ElementName,DisplayName,Attributes';
                            getAll.push(gApp._appendGETPromise(mt, fieldList));
                        });

                        Deft.Promise.all(getAll).then({
                            success: function(results) {
                                console.log('Received Promises: ', results);
                                _.each(results, function(result) {
                                    //We will have the responseText as a JSON string. Parse this to an object and add to the node array
                                    var data = Ext.JSON.decode(result.responseText).TypeDefinition;
                                    nodes.push( {
                                        Name: data._ref.substring(data._ref.lastIndexOf('/typedefinition/')),
                                        data: data,
                                        Description: data.DisplayName
                                    });
                                });

                                _.each(nodes,function(d) {
                                    d.Parent = d.data.Parent && d.data.Parent.Name;
                                });
                                gApp._drawTree(gApp._createRoot(nodes));
                            },
                            failure: function() {
                                console.log('Get initial data Promise failed');
                            }
                        });
                    }
                    else {
                        Rally.ui.notify.Notifier.show('Failed to fetch initial type records');
                    }
                    
                }
            }
        });
    }
});
