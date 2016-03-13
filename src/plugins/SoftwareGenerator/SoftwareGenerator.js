/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Generated by PluginGenerator 0.14.0 from webgme on Wed Mar 02 2016 22:16:42 GMT-0600 (Central Standard Time).
 */
    
define([
    'plugin/PluginConfig',
    'plugin/PluginBase',
    'common/util/ejs', // for ejs templates
    'common/util/xmljsonconverter', // used to save model as json
    'plugin/SoftwareGenerator/SoftwareGenerator/Templates/Templates', // 
    'plugin/SoftwareGenerator/SoftwareGenerator/meta',
    'q'
], function (
    PluginConfig,
    PluginBase,
    ejs,
    Converter,
    TEMPLATES,
    MetaTypes,
    Q) {
    'use strict';

    /**
     * Initializes a new instance of SoftwareGenerator.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin SoftwareGenerator.
     * @constructor
     */
    var SoftwareGenerator = function () {
        // Call base class' constructor.
        PluginBase.call(this);
        this.metaTypes = MetaTypes;
        this.FILES = {
            'component_cpp': 'component.cpp.ejs',
            'component_hpp': 'component.hpp.ejs',
            'cmakelists': 'CMakeLists.txt.ejs',
            'package_xml': 'package_xml.ejs'
        };
    };

    // Prototypal inheritance from PluginBase.
    SoftwareGenerator.prototype = Object.create(PluginBase.prototype);
    SoftwareGenerator.prototype.constructor = SoftwareGenerator;

    /**
     * Gets the name of the SoftwareGenerator.
     * @returns {string} The name of the plugin.
     * @public
     */
    SoftwareGenerator.prototype.getName = function () {
        return 'SoftwareGenerator';
    };

    /**
     * Gets the semantic version (semver.org) of the SoftwareGenerator.
     * @returns {string} The version of the plugin.
     * @public
     */
    SoftwareGenerator.prototype.getVersion = function () {
        return '0.1.0';
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
    SoftwareGenerator.prototype.main = function (callback) {
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this;

        // Default fails
        self.result.success = false;

	var currentConfig = self.getCurrentConfig();
        self.logger.info('Current configuration ' + JSON.stringify(currentConfig, null, 4));

        if (typeof WebGMEGlobal !== 'undefined') {
            callback(new Error('Client-side execution is not supported'), self.result);
            return;
        }
	
        self.updateMETA(self.metaTypes);

        self.createMessage(self.activeNode, 'ROSMOD::Starting Software Code Generator','info');

      	self.loadSoftwareModel(self.activeNode)
  	    .then(function (softwareModel) {
        	self.createMessage(self.activeNode, 'Parsed model');
        	return self.generateArtifacts(softwareModel);
  	    })
	    .then(function (softwareModel) {
        	self.createMessage(self.activeNode, 'Generated artifacts');
		return self.downloadLibraries(softwareModel);
	    })
	    .then(function (softwareModel) {
        	self.createMessage(self.activeNode, 'Downloaded libraries');
		return self.compileBinaries(softwareModel);
	    })
	    .then(function (softwareModel) {
        	self.createMessage(self.activeNode, 'Compiled binaries');
        	self.result.setSuccess(true);
        	callback(null, self.result);
	    })
	    .catch(function (err) {
        	self.logger.error(err);
        	self.createMessage(self.activeNode, err.message, 'error');
        	self.result.setSuccess(false);
        	callback(err, self.result);
	    })
		.done();
    };

    SoftwareGenerator.prototype.loadSoftwareModel = function (rootNode) {
        var self = this,
	    dataModel = {
		name: self.core.getAttribute(rootNode, 'name'),
		packages: {}
	    };

        return self.core.loadSubTree(rootNode)
	    .then(function (nodes) {
		var messages = [],
		    services = [];
		for (var i=0;i<nodes.length; i+= 1) {
		    var node = nodes[i],
			nodeName = self.core.getAttribute(node, 'name'),
			parent = self.core.getParent(node),
			parentName = self.core.getAttribute(parent, 'name');
		    if ( self.core.isTypeOf(node, self.META.Package) ) {
			dataModel.packages[nodeName] = {
			    name: nodeName,
			    messages: {},
			    services: {},
			    components: {},
			    libraries: {}
			};
		    }
		    else if ( self.core.isTypeOf(node, self.META.Message) ) {
			dataModel.packages[parentName].messages[nodeName] = {
			    name: nodeName,
			    packageName: parentName,
			    definition: self.core.getAttribute(node, 'Definition')
			};
			messages.push(node);
		    }
		    else if ( self.core.isTypeOf(node, self.META.Service) ) {
			dataModel.packages[parentName].services[nodeName] = {
			    name: nodeName,
			    packageName: parentName,
			    definition: self.core.getAttribute(node, 'Definition')
			};
			services.push(node);
		    }
		    else if ( self.core.isTypeOf(node, self.META.Component) ) {
			dataModel.packages[parentName].components[nodeName] = {
			    name: nodeName,
			    packageName: parentName,
			    requiredTypes: [],
			    timers: {},
			    publishers: {},
			    subscribers: {},
			    clients: {},
			    servers: {},
			    forwards: self.core.getAttribute(node, 'Forwards'),
			    definitions: self.core.getAttribute(node, 'Definitions'),
			    initialization: self.core.getAttribute(node, 'Initialization'),
			    destruction: self.core.getAttribute(node, 'Destruction'),
			    members: self.core.getAttribute(node, 'Members')
			};
		    }
		    else if ( self.core.isTypeOf(node, self.META.Timer) ) {
			var pkgName = self.core.getAttribute(
			    self.core.getParent(parent), 'name');
			dataModel.packages[pkgName]
			    .components[parentName]
			    .timers[nodeName] = {
				name: nodeName,
				period: self.core.getAttribute(node, 'Period'),
				priority: self.core.getAttribute(node, 'Priority'),
				deadline: self.core.getAttribute(node, 'Deadline'),
				operation: self.core.getAttribute(node, 'Operation')
			    };
		    }
		    else if ( self.core.isTypeOf(node, self.META.Publisher) ) {
			var pkgName = self.core.getAttribute(
			    self.core.getParent(parent), 'name');
			dataModel.packages[pkgName]
			    .components[parentName]
			    .publishers[nodeName] = {
				name: nodeName,
				topic: {},
				priority: self.core.getAttribute(node, 'Priority'),
				networkProfile: self.core.getAttribute(node, 'NetworkProfile')
			    };
		    }
		    else if ( self.core.isTypeOf(node, self.META.Subscriber) ) {
			var pkgName = self.core.getAttribute(
			    self.core.getParent(parent), 'name');
			dataModel.packages[pkgName]
			    .components[parentName]
			    .subscribers[nodeName] = {
				name: nodeName,
				topic: {},
				priority: self.core.getAttribute(node, 'Priority'),
				networkProfile: self.core.getAttribute(node, 'NetworkProfile'),
				deadline: self.core.getAttribute(node, 'Deadline'),
				operation: self.core.getAttribute(node, 'Operation')
			    };
		    }
		    else if ( self.core.isTypeOf(node, self.META.Client) ) {
			var pkgName = self.core.getAttribute(
			    self.core.getParent(parent), 'name');
			dataModel.packages[pkgName]
			    .components[parentName]
			    .clients[nodeName] = {
				name: nodeName,
				service: {},
				priority: self.core.getAttribute(node, 'Priority'),
				networkProfile: self.core.getAttribute(node, 'NetworkProfile')
			    };
		    }
		    else if ( self.core.isTypeOf(node, self.META.Server) ) {
			var pkgName = self.core.getAttribute(
			    self.core.getParent(parent), 'name');
			dataModel.packages[pkgName]
			    .components[parentName]
			    .servers[nodeName] = {
				name: nodeName,
				service: {},
				priority: self.core.getAttribute(node, 'Priority'),
				networkProfile: self.core.getAttribute(node, 'NetworkProfile'),
				deadline: self.core.getAttribute(node, 'Deadline'),
				operation: self.core.getAttribute(node, 'Operation')
			    };
		    }
		}
		return {'dataModel':dataModel, 'messages':messages, 'services':services};
	    })
	    .then(function (softwareModel) {
		return self.resolvePointers(softwareModel);
	    });
    };

    SoftwareGenerator.prototype.resolvePointers = function (softwareModel) {
	var self = this;
	
	return self.gatherReferences(softwareModel.messages, softwareModel.services)
	    .then(function(retData) {
		for (var i=0; i < retData.length; i++) {
		    var subarr = retData[i];
		    for (var j=0; j < subarr.length; j++) {
			var dataRef = subarr[j],
			    test = -1,
			    type = -1;
			if (dataRef.srcType == 'Publisher') {
			    type = softwareModel
				.dataModel.packages[dataRef.topicPackage]
				.messages[dataRef.topic];
			    softwareModel.dataModel.packages[dataRef.srcPkg]
				.components[dataRef.srcComp]
				.publishers[dataRef.src]
				.topic = type;
			    test = softwareModel.dataModel.packages[dataRef.srcPkg]
				.components[dataRef.srcComp]
				.requiredTypes
				.indexOf(type);
			}
			else if (dataRef.srcType == 'Subscriber') {
			    type = softwareModel
				.dataModel.packages[dataRef.topicPackage]
				.messages[dataRef.topic];
			    softwareModel.dataModel.packages[dataRef.srcPkg]
				.components[dataRef.srcComp]
				.subscribers[dataRef.src]
				.topic = type;
			    test = softwareModel.dataModel.packages[dataRef.srcPkg]
				.components[dataRef.srcComp]
				.requiredTypes
				.indexOf(type);
			}
			else if (dataRef.srcType == 'Client') {
			    type = softwareModel
				.dataModel.packages[dataRef.servicePackage]
				.services[dataRef.service];
			    softwareModel.dataModel.packages[dataRef.srcPkg]
				.components[dataRef.srcComp]
				.clients[dataRef.src]
				.service = type;
			    test = softwareModel.dataModel.packages[dataRef.srcPkg]
				.components[dataRef.srcComp]
				.requiredTypes
				.indexOf(type);
			}
			else if (dataRef.srcType == 'Server') {
			    type = softwareModel
				.dataModel.packages[dataRef.servicePackage]
				.services[dataRef.service];
			    softwareModel.dataModel.packages[dataRef.srcPkg]
				.components[dataRef.srcComp]
				.servers[dataRef.src]
				.service = type;
			    test = softwareModel.dataModel.packages[dataRef.srcPkg]
				.components[dataRef.srcComp]
				.requiredTypes
				.indexOf(type);
			}
			if (test == -1 && type != -1) {
			    softwareModel.dataModel.packages[dataRef.srcPkg]
				.components[dataRef.srcComp]
				.requiredTypes.push(type);
			}
		    }
		}
		return softwareModel.dataModel;
	    });
    };

    SoftwareGenerator.prototype.gatherReferences = function (messages, services) {
	var self = this;
	var refPromises = [];

	return self.core.loadCollection(messages[0], 'Message')
	    .then(function () {
		self.logger.info('iterating through messages');
		for (var i=0; i<messages.length; i++) {
		    refPromises.push(self.getMessagePointerData(messages[i]));
		}
	    }).then(function () {
		self.logger.info('iterating through services');
		for (var i=0; i<services.length; i++) {
		    refPromises.push(self.getServicePointerData(services[i]));
		}
	    }).then(function () {
		return Q.all(refPromises);
	    });
    };

    SoftwareGenerator.prototype.getMessagePointerData = function (msgObj) {
	var self = this;
	var msgName = self.core.getAttribute(msgObj, 'name');
	var msgPkgName = self.core.getAttribute(self.core.getParent(msgObj), 'name');
	self.logger.info('Processing nodes for message ' + msgName);
	return self.core.loadCollection(msgObj, 'Message')
	    .then(function (nodes) {
		var msgDataReferences = [];
		for (var i=0; i < nodes.length; i++) {
		    var nodeName = self.core.getAttribute(nodes[i], 'name');
		    var comp = self.core.getParent(nodes[i]);
		    var compName = self.core.getAttribute(comp, 'name');
		    var pkg = self.core.getParent(comp);
		    var pkgName = self.core.getAttribute(pkg, 'name');
		    var baseObject = self.core.getBaseType(nodes[i]);
		    var baseType = self.core.getAttribute(baseObject, 'name');
		    msgDataReferences.push({
			topic: msgName,
			topicPackage: msgPkgName,
			srcType: baseType,
			src: nodeName,
			srcComp: compName,
			srcPkg: pkgName
		    });
		}
		return msgDataReferences;
	    });
    };

    SoftwareGenerator.prototype.getServicePointerData = function (srvObj) {
	var self = this;
	var srvName = self.core.getAttribute(srvObj, 'name');
	var srvPkgName = self.core.getAttribute(self.core.getParent(srvObj), 'name');
	self.logger.info('Processing nodes for service ' + srvName);
	return self.core.loadCollection(srvObj, 'Service')
	    .then(function (nodes) {
		var srvDataReferences = [];
		for (var i=0; i < nodes.length; i++) {
		    var nodeName = self.core.getAttribute(nodes[i], 'name');
		    var comp = self.core.getParent(nodes[i]);
		    var compName = self.core.getAttribute(comp, 'name');
		    var pkg = self.core.getParent(comp);
		    var pkgName = self.core.getAttribute(pkg, 'name');
		    var baseObject = self.core.getBaseType(nodes[i]);
		    var baseType = self.core.getAttribute(baseObject, 'name');
		    srvDataReferences.push({
			service: srvName,
			servicePackage: srvPkgName,
			srcType: baseType,
			src: nodeName,
			srcComp: compName,
			srcPkg: pkgName
		    });
		}
		return srvDataReferences;
	    });
    };

    SoftwareGenerator.prototype.generateArtifacts = function (softwareModel) {
	var self = this,
	    filesToAdd = {},
	    prefix = 'src/',
	    deferred = new Q.defer();
	filesToAdd[softwareModel.name + '.json'] = JSON.stringify(softwareModel, null, 2);
        filesToAdd[softwareModel.name + '_metadata.json'] = JSON.stringify({
    	    projectID: self.projectID,
            commitHash: self.commitHash,
            branchName: self.branchName,
            timeStamp: (new Date()).toISOString(),
            pluginVersion: self.getVersion()
        }, null, 2);

	var filendir = require('filendir');

        for (var pkg in softwareModel.packages) {
	    var pkgInfo = softwareModel.packages[pkg],
		cmakeFileName = prefix + pkgInfo.name + '/CMakeLists.txt',
		cmakeTemplate = TEMPLATES[self.FILES['cmakelists']];
	    filesToAdd[cmakeFileName] = ejs.render(cmakeTemplate, {'pkgInfo':pkgInfo});

	    var packageXMLFileName = prefix + pkgInfo.name + '/package.xml',
		packageXMLTemplate = TEMPLATES[self.FILES['package_xml']];
	    filesToAdd[packageXMLFileName] = ejs.render(packageXMLTemplate, {'pkgInfo':pkgInfo});

	    for (var cmp in pkgInfo.components) {
		var compInfo = pkgInfo.components[cmp];
		self.generateComponentFiles(filesToAdd, prefix, pkgInfo, compInfo);
	    }

	    for (var msg in pkgInfo.messages) {
		var msgInfo = pkgInfo.messages[msg],
		    msgFileName = prefix + pkgInfo.name + '/msg/' + msgInfo.name + '.msg';
		filesToAdd[msgFileName] = msgInfo.definition;
	    }

	    for (var srv in pkgInfo.services) {
		var srvInfo = pkgInfo.services[srv],
		    srvFileName = prefix + pkgInfo.name + '/srv/' + srvInfo.name + '.srv';
		filesToAdd[srvFileName] = srvInfo.definition;
	    }
	}

	for (var f in filesToAdd){
	    var fname = './tmp/' + f,
		data = filesToAdd[f];

	    filendir.writeFile(fname, data, function(err) {
		if(err) {
		    deferred.reject(new Error(err));
		    self.logger.error(err);
		    return;
		}
		deferred.resolve();
	    });
	}
	return softwareModel;
    };

    SoftwareGenerator.prototype.generateComponentFiles = function (filesToAdd, prefix, pkgInfo, compInfo) {
	var inclFileName = prefix + pkgInfo.name + '/include/' + pkgInfo.name + '/' + compInfo.name + '.hpp',
	    srcFileName = prefix + pkgInfo.name + '/src/' + pkgInfo.name + '/' + compInfo.name + '.cpp',
	    compCPPTemplate = TEMPLATES[this.FILES['component_cpp']],
	    compHPPTemplate = TEMPLATES[this.FILES['component_hpp']];
	filesToAdd[inclFileName] = ejs.render(compHPPTemplate, {'compInfo':compInfo});
	filesToAdd[srcFileName] = ejs.render(compCPPTemplate, {'compInfo':compInfo});
    };

    SoftwareGenerator.prototype.downloadLibraries = function (softwareModel)
    {
	var self = this,
	    prefix = './tmp/src/',
	    deferred = new Q.defer();

	// Dependencies
	var AdmZip = require('adm-zip');

	// App variables
	var file_url = 'http://github.com/rosmod/lib-objecttracker/files/170732/ObjectTracker.zip',
	    file_url = 'http://i.imgur.com/oHxaxxt.png';
	file_url = 'http://github.com/rosmod/lib-aruco/archive/master.zip'
	var dir = prefix,
	    file_name = 'ObjectTracker.zip',
	    file_name = 'test.png';
	file_name = 'test.zip';

	self.write_file = '';
	self.complete = false;
	self.content_length = 0;
	self.downloaded_bytes = 0;
	self.download(file_url, dir + file_name, 0);
	
	/*
	var file = fs.createWriteStream(dir + file_name);
	request({ 'url':file_url,
		  followRedirect: true,
		  followAllRedirects: true}).pipe(file);

	return request( file_url, function(err, response, body) {
	    if (err) {
		self.logger.error(err)
		return;
	    }
	    self.logger.info('response size: ' + response.toString().length);
	    self.logger.info('response: ' + response.statusCode);
	    self.logger.info('body size: ' + body.length);
	    fs.writeFileSync(dir + file_name, response.body);
	    self.logger.info(file_name + ' downloaded to ' + dir);
	      var zip = new AdmZip(dir + file_name);
	      var zipEntries = zip.getEntries(); // an array of ZipEntry records
	      zipEntries.forEach(function(zipEntry) {
	      self.logger.info(zipEntry.toString()); // outputs zip entries information
	      });
	      // extracts everything
	      zip.extractAllTo(dir, true);
	});
	*/
    };

    SoftwareGenerator.prototype.compileBinaries = function (softwareModel)
    {
	return softwareModel;
    };

    SoftwareGenerator.prototype.download = function(remote, local_file, num) {
	var fs = require('fs'),
	    http = require('http'),
	    https = require('https'),
	    url = require('url');

	var self = this;
	self.logger.info( 'connecting to: ' + remote );
	if ( num > 10 ) {
	    self.logger.error( 'Too many redirects' );
	    return;
	}
	//set some default values  
	var redirect = false;
	var new_remote = null;
	var write_to_file = false;
	var write_file_ready = false;
	//parse the url of the remote file
	var u = url.parse(remote);
	//set the options for the 'get' from the remote file
	var opts = {
	    host: u.hostname,
	    port: 80,
	    path: u.pathname,
	    method: 'GET',
	    headers: {
		accept: '*/*'
	    }
	};
	var transport = http;
	if (remote.indexOf('https') > -1) {
	    self.logger.info('Using https transport.');
	    transport = https;
	    opts.port = 443;
	}
	//get the file
	var request = transport.get(opts, function(response ) {
	    switch(response.statusCode) {
	    case 200:
		//this is good
		//what is the content length?
		self.content_length = response.headers['content-length'];
		self.logger.info('content length: ' + self.content_length);
		break;
	    case 301:
	    case 302:
		new_remote = response.headers.location;
		self.logger.info('redirecting to: ' + response.headers.location);
		self.download(new_remote, local_file, num+1 );
		return;
		break;
	    case 404:
		self.logger.info("File Not Found");
	    default:
		//what the hell is default in this situation? 404?
		self.logger.info("GOT SOMETHING ELSE: " + response.statusCode);
		request.abort();
		return;
	    }
	    response.on('data', function(chunk) {
		//are we supposed to be writing to file?
		if(!write_file_ready) {
		    //set up the write file
		    self.write_file = fs.createWriteStream(local_file);
		    write_file_ready = true;
		}
		self.write_file.write(chunk);
		self.downloaded_bytes+=chunk.length;
		var percent = parseInt( (self.downloaded_bytes/self.content_length)*100 );
		self.logger.info( 'percent: ' + percent );
	    });
	    response.on('end', function() {
		self.complete = true;
		self.write_file.end();
	    });
	});
	request.on('error', function(e) {
	    self.logger.info("Got error: " + e.message);
	});
    };


    SoftwareGenerator.prototype.mkdirSync = function (path) {
	var self = this,
	    fs = require('fs'),
	    path = require('path');
	try {
	    fs.mkdirSync(path);
	} catch(e) {
	    if ( e.code != 'EEXIST' ) throw e;
	}
    };

    SoftwareGenerator.prototype.mkdirpSync = function (dirpath) {
	var self = this,
	    path = require('path');
	var parts = dirpath.split(path.sep);
	for( var i = 1; i <= parts.length; i++ ) {
	    self.mkdirSync( path.join.apply(null, parts.slice(0, i)) );
	}
    };

    return SoftwareGenerator;
});
