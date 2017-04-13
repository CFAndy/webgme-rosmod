/*globals define, WebGMEGlobal*/
/*jshint browser: true*/

/**
 * Generated by VisualizerGenerator 0.1.0 from webgme on Wed Mar 16 2016 12:18:29 GMT-0700 (PDT).
 */

define([
    'text!./RootViz.html',
    'text!./DefaultIcon.svg',
    'js/DragDrop/DropTarget',
    'js/DragDrop/DragConstants',
    'common/util/ejs',
    './Templates',
    'js/Utils/GMEConcepts',
    'js/NodePropertyNames',
    'css!./styles/RootVizWidget.css'
], function (
    RootVizHtml,
    DefaultIcon,
    dropTarget,
    DROP_CONSTANTS,
    ejs,
    TEMPLATES,
    GMEConcepts,
    nodePropertyNames) {
    'use strict';

    var RootVizWidget,
        WIDGET_CLASS = 'root-viz';

    RootVizWidget = function (logger, container, client) {
        this._logger = logger.fork('Widget');

        this.$el = container;

	this._client = client;

        this.nodes = {};

        this._initialize();
	this._makeDroppable();

        this._logger.debug('ctor finished');
    };

    RootVizWidget.prototype._initialize = function () {
        // set widget class
        this.$el.addClass(WIDGET_CLASS);
        this.$el.append(RootVizHtml);
	this.$table = this.$el.find('#rootVizTable');
	this._tableSetup = false;
    };

    RootVizWidget.prototype.setupTable = function() {
	var sizeOfElement = 300;
        var width = this.$el.width(),
            height = this.$el.height();
	this._numElementsPerRow = Math.floor(width / sizeOfElement) || 1;
	this.$table.empty();
	this.$table.append('<colgroup>');
	for (var i=0;i<this._numElementsPerRow;i++)
	    this.$table.append('<col width="'+100/this._numElementsPerRow+'%" height="auto">');
	this.$table.append('</colgroup>');
	this._tableSetup = true;

	this._numNodes = 0;
	this._currentRow = 0;
    };

    RootVizWidget.prototype.createNodeEntry = function (desc) {
	var row,
	column,
	panelId;
	
	if (!this._tableSetup)
	    this.setupTable();

	if ((this._numNodes % this._numElementsPerRow) == 0) {
	    this._currentRow++;
	    this.$table.append('<tr id="rowClass'+this._currentRow+'"></tr>');
	}

	panelId = desc.id.replace(/\//g,'-');

	row = this.$el.find('#rowClass' + this._currentRow);
	row.append('<td style="width: '+5000+'px; vertical-align: top; padding-top: 10px; padding-bottom: 10px; padding-right: 10px; padding-left: 10px;" id="colClass'+panelId+'"></td>');

	this.updateNodeEntry(desc);
	this._numNodes++;
    };

    RootVizWidget.prototype.updateNodeEntry = function(desc) {
	var self = this;
	var column,
	    projectHtml,
	    gmeId,
	    panelId,
	    title,
	    icon,
	    authors,
	    brief,
	    detailed,
	    svg,
	    htmlId,
	    html;
	
	title = desc.name;
	gmeId = desc.id;
	panelId = gmeId.replace(/\//g,'-');
	icon = desc.icon;
	if (!icon) {
	    icon = DefaultIcon;
	}
	authors = desc.authors;
	brief = desc.brief;
	detailed = desc.detailed;
	projectHtml = ejs.render(TEMPLATES['Project.html.ejs'], {
	    id: panelId,
	    title: title,
	    icon: icon,
	    authors: authors,
	    brief: brief,
	    detailed: detailed
	});

	column = this.$el.find('#colClass' + panelId);
	column.empty();
	column.append(projectHtml);

	function divClicked() {
	    var divHtml = $(this).text();
	    var attribute = $(this).attr('class');
	    var editableText = $("<textarea />");
	    editableText.val(divHtml);
	    editableText.attr('class', attribute);
	    $(this).replaceWith(editableText);
	    editableText.focus();
	    // setup the blur event for this new textarea
	    editableText.blur(editableTextBlurred);
	    event.stopPropagation();
	    event.preventDefault();
	}

	function editableTextBlurred() {
	    var text = $(this).val();
	    var attribute = $(this).attr('class');
	    var viewableText = $("<div>");
	    viewableText.text(text);
	    viewableText.attr('class', attribute);
	    $(this).replaceWith(viewableText);
	    // setup the click event for this new div
	    viewableText.on('dblclick', divClicked);
	    // save the attribute
	    self._client.setAttribute(gmeId, attribute, text);
	}

	// editable authors area
	$('#'+panelId+'-authors').on('dblclick', divClicked);
	// editable brief area
	$('#'+panelId+'-brief').on('dblclick', divClicked);
	// editable detailed area
	$('#'+panelId+'-detailed').on('dblclick', divClicked);

	svg = column.find('svg');
	svg.css('height', '120px');
	svg.css('width', 'auto');

	htmlId = panelId + '-node-panel';
	html = this.$el.find('#' + htmlId);

	html.addClass('panel-info');
	html.on('mouseenter', (event) => {
	    html.addClass('panel-primary');
	    html.removeClass('panel-info');
	});
	html.on('mouseleave', (event) => {
	    html.addClass('panel-info');
	    html.removeClass('panel-primary');
	});
	html.on('click', (event) => {
	    this.onNodeSelect(desc.id);
	    event.stopPropagation();
	    event.preventDefault();
	});
	html.on('contextmenu', (event) => {
	    // handle right click here
	    // make menu with copy option
	    // make menu with delete option
	    this.onNodeSelect(desc.id);
	    event.stopPropagation();
	    event.preventDefault();
	});
	html.on('dblclick', (event) => {
	    this.onNodeClick(desc.id);
	    event.stopPropagation();
	    event.preventDefault();
	});

	this.nodes[desc.id] = desc;
    };

    RootVizWidget.prototype.onWidgetContainerResize = function (width, height) {
	this.setupTable();
	for (var id in this.nodes) {
            this.addNode(this.nodes[id]);
	}
    };

    // Adding/Removing/Updating items
    var NODE_WHITELIST = {
        Project: true
    };
    RootVizWidget.prototype.addNode = function (desc) {

        if (desc) {
	    var isValid = NODE_WHITELIST[desc.meta];

            if (isValid) {
		//this._nodes.push(desc);
		this.createNodeEntry(desc);
            }
        }
    };

    RootVizWidget.prototype.removeNode = function (gmeId) {
	if (this.nodes[gmeId]) {
            delete this.nodes[gmeId];
	    this.setupTable();
	    for (var id in this.nodes) {
		this.addNode(this.nodes[id]);
	    }
	}
    };

    RootVizWidget.prototype.updateNode = function (desc) {
	this.updateNodeEntry(desc);
    };

    RootVizWidget.prototype._isValidDrop = function (dragInfo) {
	if (!dragInfo)
	    return false;
	var self = this;
        var result = false,
        draggedNodePath,
	nodeObj,
	nodeName,
	metaObj,
	metaName;

        if (dragInfo[DROP_CONSTANTS.DRAG_ITEMS].length === 1) {
            draggedNodePath = dragInfo[DROP_CONSTANTS.DRAG_ITEMS][0];
	    nodeObj = self._client.getNode(draggedNodePath);
	    nodeName = nodeObj.getAttribute('name');
	    metaObj = self._client.getNode(nodeObj.getMetaTypeId());
	    if (metaObj) {
		metaName = metaObj.getAttribute('name');
	    }
            result = metaName && metaName == 'Project';
        }

        return result;
    };

    RootVizWidget.prototype.createProject = function(nodePath) {
	var client = this._client;
	var parentId = '/v', // for our seeds, /v is always 'Projects'
	node = client.getNode(nodePath),
	nodeId = node.getId(),
	baseId = node.getBaseId(),
	baseNode = client.getNode(baseId),
	baseName = baseNode.getAttribute('name');

	if (baseName == 'FCO') { // 
	    var childCreationParams = {
		parentId: parentId,  // Should be Projects (/v)
		baseId: nodeId,    // should be META:Project
	    };
	    client.createChild(childCreationParams, 'Creating new Project');
	}
	else if (baseName == 'Project') {
            var params = {parentId: parentId};
	    params[nodeId] = {};
            this._client.startTransaction();
            this._client.copyMoreNodes(params);
            this._client.completeTransaction();
	}
    };

    /* * * * * * * * Visualizer event handlers * * * * * * * */

    RootVizWidget.prototype._makeDroppable = function () {
	var self = this,
	desc;
        self.$el.addClass('drop-area');
        //self._div.append(self.__iconAssignNullPointer);

        dropTarget.makeDroppable(self.$el, {
            over: function (event, dragInfo) {
                if (self._isValidDrop(dragInfo)) {
                    self.$el.addClass('accept-drop');
                } else {
                    self.$el.addClass('reject-drop');
                }
            },
            out: function (/*event, dragInfo*/) {
                self.$el.removeClass('accept-drop reject-drop');
            },
            drop: function (event, dragInfo) {
                if (self._isValidDrop(dragInfo)) {
		    self.createProject(dragInfo[DROP_CONSTANTS.DRAG_ITEMS][0]);
                }
                self.$el.removeClass('accept-drop reject-drop');
            }
        });
    };

    RootVizWidget.prototype.onNodeSelect = function (id) {
	if (id)
	    WebGMEGlobal.State.registerActiveSelection([id]);
    };

    RootVizWidget.prototype.onNodeClick = function (id) {
        // This currently changes the active node to the given id and
        // this is overridden in the controller.
    };

    RootVizWidget.prototype.onBackgroundDblClick = function () {
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    RootVizWidget.prototype.destroy = function () {
    };

    RootVizWidget.prototype.onActivate = function () {
    };

    RootVizWidget.prototype.onDeactivate = function () {
    };

    return RootVizWidget;
});
