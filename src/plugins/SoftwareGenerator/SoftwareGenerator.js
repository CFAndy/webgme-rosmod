/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Generated by PluginGenerator 0.14.0 from webgme on Wed Mar 02 2016 22:16:42 GMT-0600 (Central Standard Time).
 */

define([
    'plugin/PluginConfig',
    'plugin/PluginBase',
    'text!./metadata.json',
    'common/util/ejs', // for ejs templates
    'common/util/xmljsonconverter', // used to save model as json
    'plugin/SoftwareGenerator/SoftwareGenerator/Templates/Templates', // 
    'rosmod/meta',
    'rosmod/remote_utils',
    'rosmod/modelLoader',
    'q'
], function (
    PluginConfig,
    PluginBase,
    pluginMetadata,
    ejs,
    Converter,
    TEMPLATES,
    MetaTypes,
    utils,
    loader,
    Q) {
    'use strict';

    pluginMetadata = JSON.parse(pluginMetadata);

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
	this.pluginMetadata = pluginMetadata;
        this.FILES = {
            'component_cpp': 'component.cpp.ejs',
            'component_hpp': 'component.hpp.ejs',
            'cmakelists': 'CMakeLists.txt.ejs',
            'package_xml': 'package_xml.ejs',
	    'doxygen_config': 'doxygen_config.ejs'
        };
    };

    SoftwareGenerator.metadata = pluginMetadata;

    // Prototypal inheritance from PluginBase.
    SoftwareGenerator.prototype = Object.create(PluginBase.prototype);
    SoftwareGenerator.prototype.constructor = SoftwareGenerator;

    SoftwareGenerator.prototype.notify = function(level, msg) {
	var self = this;
	var prefix = self.projectId + '::' + self.projectName + '::' + level + '::';
	var max_msg_len = 100;
	if (level=='error')
	    self.logger.error(msg);
	else if (level=='debug')
	    self.logger.debug(msg);
	else if (level=='info')
	    self.logger.info(msg);
	else if (level=='warning')
	    self.logger.warn(msg);
	self.createMessage(self.activeNode, msg, level);
	if (msg.length < max_msg_len)
	    self.sendNotification(prefix+msg);
	else {
	    var splitMsgs = utils.chunkString(msg, max_msg_len);
	    splitMsgs.map(function(splitMsg) {
		self.sendNotification(prefix+splitMsg);
	    });
	}
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

	// What did the user select for our configuration?
	var currentConfig = self.getCurrentConfig();
	self.compileCode = currentConfig.compile;
	self.generateDocs = currentConfig.generate_docs;
	self.returnZip = currentConfig.returnZip;
	self.runningOnClient = false;

        if (typeof WebGMEGlobal !== 'undefined') {
	    self.runningOnClient = true;
	    callback(new Error('Cannot run ' + self.getName() + ' in the browser!'), self.result);
	    return;
        }
	
        self.updateMETA(self.metaTypes);

	var path = require('path');

	// the active node for this plugin is software -> project
	var projectNode = self.activeNode;
	self.projectName = self.core.getAttribute(projectNode, 'name');

	// Setting up variables that will be used by various functions of this plugin
	self.gen_dir = path.join(process.cwd(),
				 'generated',
				 self.project.projectId,
				 self.branchName,
				 self.projectName);

	self.projectModel = {}; // will be filled out by loadProjectModel (and associated functions)
	self.artifacts = {}; // will be filled out and used by various parts of this plugin

	loader.logger = self.logger;
	utils.logger = self.logger;
      	loader.loadModel(self.core, projectNode)
  	    .then(function (projectModel) {
		self.projectModel = projectModel.root;
		self.projectObjects = projectModel.objects;
        	return self.generateArtifacts();
  	    })
	    .then(function () {
		return self.downloadLibraries();
	    })
	    .then(function () {
		return self.runCompilation();
	    })
	    .then(function () {
		return self.generateDocumentation();
	    })
	    .then(function () {
		return self.createZip();
	    })
	    .then(function () {
        	self.result.setSuccess(true);
        	callback(null, self.result);
	    })
	    .catch(function (err) {
		self.notify('error', err);
        	self.result.setSuccess(false);
        	callback(err, self.result);
	    })
		.done();
    };

    SoftwareGenerator.prototype.generateArtifacts = function () {
	var self = this;
	if ( self.runningOnClient ) {
	    var msg = 'Skipping code generation.'
	    self.notify('info', msg);
	    return;
	}
	var path = require('path'),
	    filendir = require('filendir'),
	    prefix = 'src/';

	var path = require('path');
	var child_process = require('child_process');

	// clear out any previous project files
	child_process.execSync('rm -rf ' + utils.sanitizePath(path.join(self.gen_dir,'bin')));
	child_process.execSync('rm -rf ' + utils.sanitizePath(path.join(self.gen_dir,'src')));

	self.artifacts[self.projectModel.name + '.json'] = JSON.stringify(self.projectModel, null, 2);
        self.artifacts[self.projectModel.name + '_metadata.json'] = JSON.stringify({
    	    projectID: self.project.projectId,
            commitHash: self.commitHash,
            branchName: self.branchName,
            timeStamp: (new Date()).toISOString(),
            pluginVersion: self.getVersion()
        }, null, 2);

	// render the doxygen template
	var doxygenConfigName = 'doxygen_config',
	    doxygenTemplate = TEMPLATES[self.FILES['doxygen_config']];
	self.artifacts[doxygenConfigName] = ejs.render(doxygenTemplate, 
						   {'projectName': self.projectName});

	var software_folder = self.projectModel.Software_list[0];
	if (software_folder && software_folder.Package_list) {
	    software_folder.Package_list.map(function(pkgInfo) {

		if (pkgInfo.Component_list) {
		    pkgInfo.Component_list.map(function(compInfo) {
			self.generateComponentFiles(prefix, pkgInfo, compInfo);
		    });
		}

		if (pkgInfo.Message_list) {
		    pkgInfo.Message_list.map(function(msgInfo) {
			var msgFileName = prefix + pkgInfo.name + '/msg/' + msgInfo.name + '.msg';
			self.artifacts[msgFileName] = msgInfo.Definition;
		    });
		}
		if (pkgInfo.Service_list) {
		    pkgInfo.Service_list.map(function(srvInfo) {
			var srvFileName = prefix + pkgInfo.name + '/srv/' + srvInfo.name + '.srv';
			self.artifacts[srvFileName] = srvInfo.Definition;
		    });
		}

		var	cmakeFileName = prefix + pkgInfo.name + '/CMakeLists.txt',
		cmakeTemplate = TEMPLATES[self.FILES['cmakelists']];
		self.artifacts[cmakeFileName] = ejs.render(cmakeTemplate, {
		    'pkgInfo':pkgInfo, 
		    'model': self.projectModel,
                    'objects': self.projectObjects
		});

		var packageXMLFileName = prefix + pkgInfo.name + '/package.xml',
		packageXMLTemplate = TEMPLATES[self.FILES['package_xml']];
		self.artifacts[packageXMLFileName] = ejs.render(packageXMLTemplate, {
		    'pkgInfo': pkgInfo,
		    'model': self.projectModel,
                    'objects': self.projectObjects
		});
	    });
	}

	var fileNames = Object.keys(self.artifacts);
	var tasks = fileNames.map(function(fileName) {
	    var deferred = Q.defer();
	    var data = self.artifacts[fileName];
	    filendir.writeFile(path.join(self.gen_dir, fileName), data, function(err) {
		if (err) {
		    deferred.reject(err);
		}
		else {
		    deferred.resolve();
		}
	    });
	    return deferred.promise;
	});

	return Q.all(tasks)
	    .then(function() {
		var msg = 'Generated artifacts.';
		self.notify('info', msg);
	    });
    };

    SoftwareGenerator.prototype.generateComponentFiles = function (prefix, pkgInfo, compInfo) {
	var self = this;
	var path = require('path');
	var moment = require('moment');
	var inclFileName = path.join(prefix,
				     pkgInfo.name,
				     'include',
				     pkgInfo.name,
				     compInfo.name + '.hpp'),
	    srcFileName = path.join(prefix,
				    pkgInfo.name,
				    'src',
				    pkgInfo.name,
				    compInfo.name + '.cpp'),
	    compCPPTemplate = TEMPLATES[this.FILES['component_cpp']],
	    compHPPTemplate = TEMPLATES[this.FILES['component_hpp']];
	self.artifacts[inclFileName] = ejs.render(compHPPTemplate, {
	    'compInfo': compInfo,
	    'moment': moment,
	    'model': self.projectModel,
            'objects': self.projectObjects
	});
	self.artifacts[srcFileName] = ejs.render(compCPPTemplate, {
	    'compInfo': compInfo,
	    'moment': moment,
	    'model': self.projectModel,
            'objects': self.projectObjects
	});
    };

    SoftwareGenerator.prototype.downloadLibraries = function ()
    {
	var self = this;
	if (self.runningOnClient) {
	    return;
	}
	var path = require('path'),
	dir = path.join(self.gen_dir, 'src');

	self.notify('info', 'Downloading Source Libraries');

	// where is the rosmod-actor executable?
	var file_url = 'https://github.com/rosmod/rosmod-actor/releases/download/v0.3.4/rosmod-node.zip';
	var tasks = [];
	if (self.projectModel.Software_list[0]['Source Library_list']) {
	    tasks = self.projectModel.Software_list[0]['Source Library_list'].map(function(lib) {
		self.notify('info', 'Downloading: ' + lib.name + ' from '+ lib.URL);
		return utils.wgetAndUnzipLibrary(lib.URL, dir);
	    });
	}

	return Q.all(tasks)
	    .then(function() {
		return utils.wgetAndUnzipLibrary(file_url, dir); // get rosmod-actor
	    });
    };

    SoftwareGenerator.prototype.generateDocumentation = function () 
    {
	var self = this;
	if (!self.generateDocs || self.runningOnClient) {
	    var msg = 'Skipping documentation generation.'
	    self.notify('info', msg);
	    return;
	}
	var msg = 'Generating documentation.'
	self.notify('info', msg);

	var path = require('path'),
	child_process = require('child_process');

	var docPath = path.join(self.gen_dir, 'doc');
	// clear out any previous documentation
	child_process.execSync('rm -rf ' + utils.sanitizePath(docPath));

	var deferred = Q.defer();
	var terminal = child_process.spawn('bash', [], {cwd:self.gen_dir});
	terminal.stdout.on('data', function (data) {});
	terminal.stderr.on('data', function (error) {
	});
	terminal.on('exit', function (code) {
	    if (code == 0) {
		deferred.resolve(code);
	    }
	    else {
		deferred.reject('document generation:: child process exited with code ' + code);
	    }
	});
	setTimeout(function() {
	    terminal.stdin.write('doxygen doxygen_config\n');
	    terminal.stdin.write('make -C ./doc/latex/ pdf\n');
	    terminal.stdin.write('mv ./doc/latex/refman.pdf ' + 
				 utils.sanitizePath(self.projectModel.name) + '.pdf');
	    terminal.stdin.end();
	}, 1000);
	return deferred.promise;
    };

    SoftwareGenerator.prototype.getValidArchitectures = function() {
	var self = this,
	validArchs = {};
	var systems_folder = self.projectModel.Systems_list[0];
	if (systems_folder && systems_folder.System_list) {
	    systems_folder.System_list.map(function(system) {
		if (system.Host_list) {
		    system.Host_list.map(function(host) {
			var devName = utils.getDeviceType(host);
			if (validArchs[devName] == undefined) {
			    validArchs[devName] = [];
			}
			validArchs[devName].push(host);
		    });
		}
	    });
	}
	return validArchs;
    };

    SoftwareGenerator.prototype.selectCompilationArchitectures = function() {
	
	var self = this;

	var validArchitectures = self.getValidArchitectures();

	var tasks = Object.keys(validArchitectures).map(function(index) {
	    return utils.getAvailableHosts(validArchitectures[index])
		.then(function(hostArr) {
		    var retObj = {};
		    retObj[index] = hostArr;
		    return retObj;
		});
	});
	return Q.all(tasks)
	    .then(function (nestedArr) {
		var validHosts = {};
		nestedArr.forEach(function(subArr) {
		    var arch = Object.keys(subArr)[0];
		    validHosts[arch] = subArr[arch];
		});
		return validHosts;
	    });
    };

    SoftwareGenerator.prototype.getObjectAttributeFromBuild = function (pkgName, compName, fileName, fileLineNumber) {
	var self = this;
	var deferred = Q.defer();
	var path = require('path');
	// find correct file
	var fileKey = path.join('src', 
				pkgName,
				(fileName.split('.')[1] == 'hpp') ? 'include' : 'src',
				pkgName,
				fileName);
	var fileData = self.artifacts[fileKey];
	if (fileData) {
	    // split the file string into line string array
	    var fileLines = fileData.split("\n");
	    // use line number from error to start working our way back using regex to find obj.attr
	    var regex = /\/\/::::([a-zA-Z0-9\/]*)::::([^:\s]*)::::(?:end::::)?/gi;
	    var path, attr, attrLineNumber;
	    for (var l=fileLineNumber; l>0; l--) {
		var line = fileLines[l];
		var result = regex.exec(line);
		if (result) {
		    path = result[1];
		    attr = result[2];
		    attrLineNumber = fileLineNumber - l -1;
		    break;
		}
	    }
	    self.core.loadByPath(self.rootNode, path, function (err, node) {
		if (err) {
		    deferred.reject(err);
		    return;
		}
		else {
		    deferred.resolve({node: node, attr: attr, lineNumber: attrLineNumber});
		}
	    });
	    return deferred.promise;
	}
	return null;
    };

    SoftwareGenerator.prototype.parseCompileStdErr = function (host, data) {
	// returns true if the error should halt the build, false otherwise
	var self = this;
	var path = require('path');
	var base_compile_dir = path.join(host.user.Directory, 'compilation');
	var compile_dir = path.join(base_compile_dir, self.project.projectId, self.branchName);

	if ( data.indexOf('error:') > -1 ) {
	    var compileErrors = utils.parseMakeErrorOutput(
		data,
		compile_dir + '/src/'
	    );
	    var tasks = compileErrors.map(function(compileError) {
		var compName = compileError.fileName.split('.')[0];
		var msg = 'Build Error:: package: ' + compileError.packageName + ', component: ' +
		    compName + ' :\n\t' +
		    compileError.text + '\n';
		self.notify('error', msg);
		return self.getObjectAttributeFromBuild(compileError.packageName, 
							compName,
							compileError.fileName, 
							compileError.line)
		    .then(function( info ) {
			var node = info.node,
			attr = info.attr,
			lineNum = info.lineNumber;
			if (node) {
			    var nodeName = self.core.getAttribute(node, 'name');
			    self.notify('error', 'Error in Package: ' + compileError.packageName + 
					', Component: ' + compName + ', NodeName: ' + nodeName + ', attribute: ' + attr + 
					', at line: ' + lineNum, node);
			}
			else {
			    self.notify('error', 'Library ' + compileError.packageName + ' has error!');
			}
		    });
		});
	    return Q.all(tasks)
		.then(function () {
		    return true;
		});
	}
	else if ( data.indexOf('warning:') > -1 ) {
	    var compileErrors = utils.parseMakeErrorOutput(
		data,
		compile_dir + '/src/'
	    );
	    compileErrors.map(function(compileError) {
		var msg = 'Build Warning:: package: ' + compileError.packageName + ', component:' +
		    compileError.fileName.split('.')[0] + ' :\n\t' +
		    compileError.text + '\n';
		self.notify('warning', msg);
	    });
	    return false;
	}
	else {
	    // handle errors that may come before make gets invoked
	    var msg = 'Build Error:: ' + data;
	    self.notify('error', msg);
	    return true;
	}
    };

    SoftwareGenerator.prototype.compileOnHost = function (host) {
	var self = this;
	var path = require('path');
	var mkdirp = require('mkdirp');
	var child_process = require('child_process');

	var base_compile_dir = path.join(host.user.Directory, 'compilation');
	var compile_dir = path.join(base_compile_dir, self.project.projectId, self.branchName);
	var archBinPath = path.join(self.gen_dir, 'bin' , utils.getDeviceType(host.host));

	var compile_commands = [
	    'cd ' + compile_dir,
	    'rm -rf bin',
	    'source '+host.host['ROS Install']+'/setup.bash',
	    'catkin_make -DNAMESPACE=rosmod',
	    'mkdir bin',
	    'cp devel/lib/*.so bin/.',
	    'cp devel/lib/node/node_main bin/.',
	    'rm -rf devel build',
	];

	child_process.execSync('rm -rf ' + utils.sanitizePath(archBinPath));

	// make the compile dir
	var t1 = new Promise(function(resolve,reject) {
	    self.notify('info', 'making compilation directory on: ' + host.intf.IP);
	    utils.mkdirRemote(compile_dir, host.intf.IP, host.user)
		.then(function() {
		    resolve();
		})
		.catch(function() {
		    reject("Couldn't make remote compilation dir!");
		});
	});
	// copy the sources to remote
	var t2 = t1.then(function() {
	    self.notify('info', 'copying compilation sources to: ' + host.intf.IP);
	    return utils.copyToHost(self.gen_dir, compile_dir, host.intf.IP, host.user);
	});
	// run the compile step
	var t3 = t2.then(function() {
	    self.notify('info', 'compiling on: ' + host.intf.IP + ' into '+compile_dir);
	    host.stdErr = '';
	    host.stdOut = '';
	    var stdErrCB = function(host) {
		return function(data) {
		    host.stdErr += data;
		    return self.parseCompileStdErr(host,data);
		};
	    }(host);
	    var stdOutCB = function(host) {
		return function(data) { host.stdOut += data; };
	    }(host);
	    return utils.executeOnHost(compile_commands, 
				       host.intf.IP, 
				       host.user, 
				       stdErrCB,
				       stdOutCB)
		.catch(function(err) {
		    //self.notify('error', "STDOUT: " +host.stdOut);
		    //self.notify('error', "STDERR: " +host.stdErr);
		    var files = {
			'compile.stdout.txt': host.stdOut,
			'compile.stderr.txt': host.stdErr
		    };
		    var fnames = Object.keys(files);
		    var tasks = fnames.map((fname) => {
			return self.blobClient.putFile(fname, files[fname])
			    .then((hash) => {
				self.result.addArtifact(hash);
			    });
		    });
		    return Q.all(tasks)
			.then(() => {
			    throw new String('Compilation failed on ' + host.intf.IP);
			});
		});
	});
	// make the local binary folder for the architecture
	var t4 = t3.then(function() {
	    mkdirp.sync(archBinPath);
	    return true;
	});
	// copy the compiled binaries from remote into the local bin folder
	var t5 = t4.then(function() {
	    self.notify('info', 'copying from ' + host.intf.IP + ' into local storage.');
	    return utils.copyFromHost(path.join(compile_dir, 'bin') + '/*', 
				      archBinPath + '/.',
				      host.intf.IP,
				      host.user);
	});
	// remove the remote folders
	var t6 = t5.then(function() {
	    self.notify('info', 'removing compilation artifacts off: ' + host.intf.IP);
	    return utils.executeOnHost(['rm -rf ' + base_compile_dir], host.intf.IP, host.user);
	});
	return Q.all([t1,t2,t3,t4,t5,t6]);
    };
    
    SoftwareGenerator.prototype.cleanHost = function(host) {
	var self = this;
	var path = require('path');
	var base_compile_dir = path.join(host.user.Directory, 'compilation');
	return utils.executeOnHost(['rm -rf ' + base_compile_dir], host.intf.IP, host.user);
    };

    SoftwareGenerator.prototype.runCompilation = function ()
    {
	var self = this;

	if (!self.compileCode || self.runningOnClient) {
	    var msg = 'Skipping compilation.';
	    self.notify('info', msg);
	    return;
	}

	return self.selectCompilationArchitectures()
	    .then(function(validHostList) {
		return self.compileBinaries(validHostList);
	    });
    };

    SoftwareGenerator.prototype.compileBinaries = function (validHostList)
    {
	var self = this;
	var selectedHosts = [];

	var path = require('path');
	var binPath = path.join(self.gen_dir, 'bin');
	var child_process = require('child_process');

	// clear out any previous binaries
	child_process.execSync('rm -rf ' + utils.sanitizePath(binPath));

	for (var arch in validHostList) {
	    var hosts = validHostList[arch];
	    if (hosts.length) {
		selectedHosts.push(hosts[0]);
	    }
	    else {
		var msg = 'No hosts could be found for compilation on ' + arch;
		self.notify('warning', msg);
	    }
	}

	var tasks = selectedHosts.map(function (host) {
	    var msg = 'Compiling for ' + utils.getDeviceType(host.host) + ' on ' + host.user.name + '@' + host.intf.IP;
	    self.notify('info', msg);
	    return self.compileOnHost(host);
	});
	
	return Q.all(tasks)
	    .then(function() {
		self.notify('info', 'Compiled binaries.');
	    })
	    .catch(function(err) {
		child_process.execSync('rm -rf ' + utils.sanitizePath(binPath));
		var tasks = selectedHosts.map(function (host) {
		    return self.cleanHost(host);
		});
		return Q.all(tasks)
		    .then(function () {
			throw err;
		    });
	    });
    };
			      
    SoftwareGenerator.prototype.createZip = function() {
	var self = this;
	
	if (!self.returnZip || self.runningOnClient) {
            self.notify('info', 'Skipping compression.');
	    return;
	}

	self.notify('info', 'Starting compression.');
	
	return new Promise(function(resolve, reject) {
	    var zlib = require('zlib'),
	    tar = require('tar'),
	    fstream = require('fstream'),
	    input = self.gen_dir;

	    var bufs = [];
	    var packer = tar.Pack()
		.on('error', function(e) { reject(e); });

	    var gzipper = zlib.Gzip()
		.on('error', function(e) { reject(e); })
		.on('data', function(d) { bufs.push(d); })
		.on('end', function() {
		    var buf = Buffer.concat(bufs);
		    var name = self.projectName + "+Software";
		    if (self.compileCode)
			name += '+Binaries';
		    if (self.generateDocs)
			name += '+Docs';
		    self.blobClient.putFile(name+'.tar.gz',buf)
			.then(function (hash) {
			    self.result.addArtifact(hash);
			    resolve();
			})
			.catch(function(err) {
			    reject(err);
			})
			    .done();
		});

	    var reader = fstream.Reader({ 'path': input, 'type': 'Directory' })
		.on('error', function(e) { reject(e); });

	    reader
		.pipe(packer)
		.pipe(gzipper);
	})
	    .then(function() {
		self.notify('info', 'Created archive.');
	    });
    };

    return SoftwareGenerator;
});
