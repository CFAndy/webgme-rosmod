/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Generated by PluginGenerator 1.7.0 from webgme on Thu Aug 25 2016 21:56:12 GMT-0500 (CDT).
 * A plugin that inherits from the PluginBase. To see source code documentation about available
 * properties and methods visit %host%/docs/source/PluginBase.html.
 */

define([
    'plugin/PluginConfig',
    'text!./metadata.json',
    'plugin/PluginBase',
    'rosmod/minify.json',
    'rosmod/meta',
    'rosmod/remote_utils',
    'rosmod/modelLoader',
    'q'
], function (
    PluginConfig,
    pluginMetadata,
    PluginBase,
    minify,
    MetaTypes,
    utils,
    modelLoader,
    Q) {
    'use strict';

    pluginMetadata = JSON.parse(pluginMetadata);

    /**
     * Initializes a new instance of Export.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin Export.
     * @constructor
     */
    var Export = function () {
        // Call base class' constructor.
        PluginBase.call(this);
        this.metaTypes = MetaTypes;
        this.pluginMetadata = pluginMetadata;
    };

    /**
     * Metadata associated with the plugin. Contains id, name, version, description, icon, configStructue etc.
     * This is also available at the instance at this.pluginMetadata.
     * @type {object}
     */
    Export.metadata = pluginMetadata;

    // Prototypical inheritance from PluginBase.
    Export.prototype = Object.create(PluginBase.prototype);
    Export.prototype.constructor = Export;

    Export.prototype.notify = function(level, msg) {
	var self = this;
	var prefix = self.projectId + '::' + self.projectName + '::' + level + '::';
	if (level=='error')
	    self.logger.error(msg);
	else if (level=='debug')
	    self.logger.debug(msg);
	else if (level=='info')
	    self.logger.info(msg);
	else if (level=='warning')
	    self.logger.warn(msg);
	self.createMessage(self.activeNode, msg, level);
	self.sendNotification(prefix+msg);
    };

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - Always log with the provided logger.[error,warning,info,debug].
     * - Do NOT put any user interaction logic UI, etc. inside this method.
     * - callback always has to be called even if error happened.
     *
     * @param {function(string, plugin.PluginResult)} callback - the result callback
     */
    Export.prototype.main = function (callback) {
        var self = this;
        self.result.success = false;

        self.updateMETA(self.metaTypes);

	// What did the user select for our configuration?
	var currentConfig = self.getCurrentConfig();
	self.modelHash = currentConfig.modelHash;
	
	loader.logger = self.logger;
	utils.logger = self.logger;

	modelLoader.loadModel(self.core, self.META, model, self.activeNode)
	    .then(function(projectModel) {
		self.projectModel = projectModel;
		// check to make sure we have the right experiment
		var expPath = self.core.getPath(self.activeNode);
		self.selectedExperiment = self.projectModel.pathDict[expPath];
		if (!self.selectedExperiment) {
		    throw new String("Cannot find experiment!");
		}
		return self.mapContainersToHosts();
	    })
	    .then(function() {
		// This will save the changes. If you don't want to save;
		self.notify('info','saving updates to model');
		return self.save('RunExperiment updated model.');
	    })
	    .then(function (err) {
		if (err.status != 'SYNCED') {
		    throw new String('Couldnt write to model!');
		}
		self.result.setSuccess(true);
		callback(null, self.result);
	    })
	    .catch(function(err) {
        	self.notify('error', err);
		self.result.setSuccess(false);
		callback(err, self.result);
	    })
		.done();
    };

    return Export;
});