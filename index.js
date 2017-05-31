/// <reference path="../typings/index.d.ts" />
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
/*
* CLASS TASK
* settFile must be like :
{
    "coreScript": "./data/simple.sh",
    "jobsArray" : [],
    "wait" : true,
    "automaticClosure": false,
    "settings": {}
}


* Usage :
var tk = require('taskObject');
var taskTest = new tk.Task (jobManager, jobProfile);
readableStream.pipe(taskTest).pipe(writableStream);
*/
// TODO
// - git ignore node_modules
// - kill method
// - implement the writing of more than one input : this.write_inputs()
var events = require("events");
var stream = require("stream");
var jsonfile = require("jsonfile");
var JSON = require("JSON");
var fs = require("fs");
//import {spawn} from 'child_process';
var uuid = require("node-uuid");
var path = require("path");
var deepEqual = require("deep-equal");
var staticTag = 'simple'; // must be unique
var Task = (function (_super) {
    __extends(Task, _super);
    /*
    * Initialize the task parameters.
    */
    function Task(jobManager, jobProfile, taskNum, options) {
        var _this = this;
        if (!jobManager)
            throw 'ERROR : a job manager must be specified';
        if (!staticTag)
            throw 'ERROR : no tagTask specified in this module';
        _this = _super.call(this, options) || this;
        _this.jobManager = jobManager;
        _this.cacheDir = _this.jobManager.cacheDir();
        _this.jobProfile = jobProfile;
        if (taskNum)
            _this.dynamicTag = staticTag + taskNum;
        else
            _this.dynamicTag = staticTag;
        _this.streamContent = '';
        _this.results = null;
        _this.goReading = false;
        _this.nextInput = false;
        _this.settFile = __dirname + '/data/settings.json';
        _this._firstSet(_this._parseJson(_this.settFile));
        return _this;
    }
    /*
    * Open a json file and return its content if no error
    */
    Task.prototype._parseJson = function (file) {
        try {
            var dict = jsonfile.readFileSync(file, 'utf8');
            return dict;
        }
        catch (err) {
            console.log('WARNING : ' + err);
            return null;
        }
    };
    /*
    * First set of the task : called by the constructor.
    * data is a literal like { 'author' : 'me', 'settings' : { 't' : 5, 'iterations' : 10 } }
    */
    Task.prototype._firstSet = function (data) {
        if (data) {
            if ('coreScript' in data)
                this.coreScript = __dirname + '/' + data.coreScript;
            else
                this.coreScript = null;
            if ('jobsArray' in data)
                this.jobsArray = data.jobsArray;
            else
                this.jobsArray = [];
            if ('wait' in data)
                this.wait = data.wait;
            else
                this.wait = true;
            if ('automaticClosure' in data)
                this.automaticClosure = data.automaticClosure;
            else
                this.automaticClosure = false;
            if ('settings' in data)
                this.settings = data.settings;
            else
                this.settings = {};
        }
    };
    /*
    * Change task parameters according to the keys in data (JSON format) :
    * data is a literal like { 'author' : 'me', 'settings' : { 't' : 5, 'iterations' : 10 } }
    */
    Task.prototype.set = function (data) {
        if (data) {
            if ('cacheDir' in data)
                this.cacheDir = data.cacheDir;
            if ('coreScript' in data)
                this.coreScript = __dirname + '/' + data.coreScript;
            if ('jobsArray' in data)
                this.jobsArray = data.jobsArray;
            if ('wait' in data)
                this.wait = data.wait;
            if ('automaticClosure' in data)
                this.automaticClosure = data.automaticClosure;
            if ('settings' in data) {
                for (var key in data.settings) {
                    if (this.settings.hasOwnProperty(key))
                        this.settings[key] = data.settings[key];
                    else
                        throw 'ERROR : cannot set the ' + key + ' property which does not exist in this task';
                }
            }
        }
    };
    /*
    * Create the directory according to @dirPath
    */
    Task.prototype.createDir = function (dirPath) {
        try {
            fs.mkdirSync(dirPath);
        }
        catch (err) {
            console.log('WARNING : ' + err);
        }
    };
    /*
    * Write the @data in the a file according to the @filePath
    */
    Task.prototype.writeFile = function (filePath, data) {
        try {
            fs.writeFileSync(filePath, data);
        }
        catch (err) {
            throw err;
        }
    };
    /*
    * Write @dict in the @filePath with a JSON format
    */
    Task.prototype.writeJson = function (filePath, dict) {
        try {
            jsonfile.writeFileSync(filePath, dict);
        }
        catch (err) {
            throw err;
        }
    };
    /*
    * According to the parameter this.automaticClosure,
    * close definitely this task or just push the string "null"
    */
    Task.prototype.pushClosing = function () {
        if (this.automaticClosure)
            this.push(null);
        else
            this.push('null');
    };
    /*
    * Bad method but necessary... to compare two JSON objects
    * In both JSON object, remove the variables that are using the uuid.
    * These variables are unique so JSONs cannot be compared if we don't remove them.
    */
    Task.prototype.deepSettingsEqual = function (json1, json2) {
        /* for this task, only json.exportVar.inputFile is unique */
        //console.log(json1, json2);
        if (json1.exportVar.inputFile && json2.exportVar.inputFile) {
            var json1_clone = JSON.parse(JSON.stringify(json1));
            var json2_clone = JSON.parse(JSON.stringify(json2));
            delete json1_clone.exportVar.inputFile;
            delete json2_clone.exportVar.inputFile;
            if (deepEqual(json1_clone, json2_clone))
                return true;
            else
                return false;
        }
        else
            return false;
    };
    /*
    * Check for differences between the settings of this & the settings of current
    * WARNING : settings of this must be in a JSON format contrary to the settings of
    * current that must be a FILE (in JSON format)
    */
    Task.prototype.settingsEqual = function (settings_this, settFile_current) {
        try {
            var settings_current = this._parseJson(settFile_current);
            // console.log('okokokok >>>' + settings_this + '<<< //// >>>' + settings_current + '<<<');
            if (this.deepSettingsEqual(settings_this, settings_current))
                return true;
            else
                return false;
        }
        catch (err) {
            console.log('WARNING : ' + err);
            return false;
        }
    };
    /*
    * Check for differences between the input of this & the input of current
    */
    Task.prototype.inputEqual = function (inputFile_this, inputFile_current) {
        try {
            var data_this = fs.readFileSync(inputFile_this, 'utf8');
        }
        catch (err) {
            console.log('WARNING : ' + err);
            return false;
        }
        try {
            var data_current = fs.readFileSync(inputFile_current, 'utf8');
        }
        catch (e) {
            console.log('WARNING : ' + e);
            return false;
        }
        //console.log('okokokok >>>' + data_this + '<<< //// >>>' + data_current + '<<<');
        if (data_this === data_current)
            return true;
        else
            return false;
    };
    /*
    * Check for differences between the core script of this & the core script of current
    */
    Task.prototype.coreScriptEqual = function (coreScript_this, coreScript_current) {
        try {
            var data_this = fs.readFileSync(coreScript_this, 'utf8');
        }
        catch (err) {
            console.log('WARNING : ' + err);
            return false;
        }
        try {
            var data_current = fs.readFileSync(coreScript_current, 'utf8');
        }
        catch (e) {
            console.log('WARNING : ' + e);
            return false;
        }
        //console.log('okokokok >>>' + data + '<<< //// >>>' + d + '<<<');
        if (data_this === data_current)
            return true;
        else
            return false;
    };
    /*
    * Search for ONE UNIQUE file ("target") among a list of files (filesDir_array)
    * from a "directory". Possible thanks the "regexTarget".
    */
    Task.prototype.searchForOneFile = function (directory, filesDir_array, regexTarget) {
        if (!directory) {
            console.log('WARNING in searchForOneFile() : no directory specified');
            return null;
        }
        else if (!filesDir_array) {
            console.log('WARNING in searchForOneFile() : no filesDir_array specified');
            return null;
        }
        else if (!regexTarget) {
            console.log('WARNING in searchForOneFile() : no regexTarget specified');
            return null;
        }
        if (filesDir_array.length == 0)
            return null;
        var fileTarget_array = filesDir_array.filter(function (file) {
            return file.match(regexTarget); // only files that match
        }).map(function (file) {
            return path.join(directory, file);
        });
        // we want only ONE file :
        if (fileTarget_array.length > 1) {
            console.log('WARNING : more than one file found : ' + fileTarget_array);
            return null;
        }
        else if (fileTarget_array.length === 0) {
            console.log('WARNING : no file found in ' + directory + ' corresponding to : ' + regexTarget);
            return null;
        }
        else
            return fileTarget_array[0];
    };
    /*
    * Check if this task has already been done,
    * by checking for differences between our actual task ("this") & the finished task (called "current")
    * (using this.settingsEqual(), this.inputEqual() and this.coreScriptEqual() methods).
    * Steps :
    * 	(1) find all task directories which the task is the same type of "this" (according to tagTask)
    * 	(2) browse task directories
    * 	(3) read the content of the task directory and the input directory
    * 	(4) check the existence of the result files (.out and .err)
    * 	(5) check the existence of both parameter files (.json && _coreScript.sh) and input file
    * 	(6) compare all current task files with this task files
    */
    Task.prototype._alreadyDone = function (jobOpt, data) {
        var tab_taskDir = this.jobManager.findTaskDir(staticTag); // (1)
        if (tab_taskDir.length === 0)
            return null;
        //console.log(tab_taskDir);
        for (var i = 0; i < tab_taskDir.length; i++) {
            var current_taskDir = tab_taskDir[i];
            var current_inputDir = current_taskDir + '_inputs'; // path of the input directory
            var basename = path.basename(current_taskDir); // basename = tagTask + 'Task_' + uuid
            var re_outFile = basename + '.out';
            var re_errFile = basename + '.err';
            var re_json = basename + '_jobOpt.json';
            var re_coreScript = basename + '_coreScript.sh';
            var re_input = basename + '.txt';
            var current_outFile = null;
            var current_errFile = null;
            var current_jsonFile = null;
            var current_coreScriptFile = null;
            var current_inputFile = null;
            console.log('basename : ' + basename); // toto = simpleTask_98cb27cb-a0cd-40be-9e39-57ee16256a78
            try {
                var files_taskDir = fs.readdirSync(current_taskDir);
            } // read content of the task directory (3)
            catch (err) {
                console.log('WARNING : ' + err);
                if (i === tab_taskDir.length - 1)
                    return null;
                ;
            }
            try {
                var files_inputDir = fs.readdirSync(current_inputDir);
            } // read content of the input directory (3)
            catch (e) {
                console.log('WARNING : ' + e);
                if (i === tab_taskDir.length - 1)
                    return null;
            }
            // check the existence of the .out and .err files before anything else (4)
            current_outFile = this.searchForOneFile(current_taskDir, files_taskDir, re_outFile);
            current_errFile = this.searchForOneFile(current_taskDir, files_taskDir, re_errFile);
            if (!current_outFile || !current_errFile) {
                if (i === tab_taskDir.length - 1)
                    return null;
            }
            else if (this._parseJson(current_outFile) === null) {
                if (i === tab_taskDir.length - 1)
                    return null;
            }
            // search for the json, _coreScript.sh and input files (5)
            current_jsonFile = this.searchForOneFile(current_inputDir, files_inputDir, re_json);
            current_coreScriptFile = this.searchForOneFile(current_taskDir, files_taskDir, re_coreScript);
            current_inputFile = this.searchForOneFile(current_inputDir, files_inputDir, re_input);
            if (current_jsonFile && current_coreScriptFile && current_inputFile) {
                if (this.settingsEqual(jobOpt.specific, current_jsonFile)) {
                    if (this.coreScriptEqual(this.coreScript, current_coreScriptFile)) {
                        if (this.inputEqual(jobOpt.specific.exportVar.inputFile, current_inputFile)) {
                            console.log('FOUND : ' + basename);
                            return current_taskDir;
                        }
                        else {
                            if (i === tab_taskDir.length - 1)
                                return null;
                        }
                    }
                    else {
                        if (i === tab_taskDir.length - 1)
                            return null;
                    }
                }
                else {
                    if (i === tab_taskDir.length - 1)
                        return null;
                }
            }
            else if (i === tab_taskDir.length - 1)
                return null;
        }
    };
    /*
    * With a key, find the path to the folder containing the results & call restoreByPath()
    * WARNING : not implemented
    */
    // restoreByKey (key: string): any {
    // 	if (!key) throw 'ERROR : no key specified';
    // 	var path: string;
    // 	return this.restoreByPath(path);
    // }
    /*
    * With a path, restore a session
    */
    Task.prototype.restoreByPath = function (pathDir) {
        if (!pathDir)
            throw 'ERROR : no path specified';
        var basename = path.basename(pathDir);
        try {
            var results = fs.readFileSync(pathDir + '/' + basename + '.out', 'utf8');
        }
        catch (err) {
            throw err;
        }
        //console.log(pathDir + '/' + basename + '.out');
        return results;
    };
    /*
    * DO NOT MODIFY
    * Pre-processing of the job.
    * Configure the dictionary to pass to the jobManager.push() function, according to :
    * 	(1) the list of the modules needed
    * 	(2) variables to export in the coreScript
    * 	(3) the profile of our configuration (arwen/arwen-dev, etc.)
    * 	(4) the "mode" (must be "cpu" or "gpu")
    * This dictionary is composed of :
    * 	- a "generic" part = include parameters that will not change the results of the task
    * 	- a "specific" part = for parameters needed to define precisely the task
    */
    Task.prototype.configJob = function (modules, exportVar, mode) {
        var jobOpt = {
            'generic': {
                'id': staticTag + 'Task_' + uuid.v4(),
                'tWall': '0-00:15',
                'nCores': null
            },
            'specific': {
                'script': this.coreScript,
                'modules': [],
                'exportVar': exportVar // (2)
            }
        };
        if (modules.length > 0)
            jobOpt.specific.modules.concat(modules);
        jobOpt.specific.exportVar['inputFile'] = this.cacheDir + '/' + jobOpt.generic.id + '_inputs/' + jobOpt.generic.id + '.txt';
        // according to our configuration (3)
        if (this.jobProfile !== null)
            for (var key in this.jobProfile)
                jobOpt.generic[key] = this.jobProfile[key];
        // parameters depending to the mode (4)
        if (mode === 'gpu') {
            jobOpt.generic.nCores = 1;
            jobOpt.generic['gres'] = 'gpu:1';
        }
        else if (mode === 'cpu') {
            jobOpt.generic.nCores = 1;
        }
        else {
            console.log("WARNING in configJob : mode not recognized. It must be \"cpu\" or \"gpu\" !");
        }
        return jobOpt;
    };
    /*
    * Use the values in @jsonValue [literal] to configure modules and exportVar for configJob.
    * And prepare the directories and files for the task : JSON (settings) & input(s).
    */
    Task.prototype.prepareTask = function (jsonValue) {
        var modules = [];
        var exportVar = {};
        var jobOpt = this.configJob(modules, exportVar, 'cpu');
        var inputDir = this.cacheDir + '/' + jobOpt.generic.id + '_inputs/';
        this.createDir(inputDir); // create the input directory
        this.writeJson(inputDir + '/' + jobOpt.generic.id + '_jobOpt.json', jobOpt.specific); // write the JSON file (settings)
        // write the input file(s) :
        this.writeFile(jobOpt.specific.exportVar.inputFile, jsonValue.input);
        return jobOpt;
    };
    /*
    * DO NOT MODIFY
    * Execute all the calculations
    */
    Task.prototype.run = function (jobOpt) {
        var emitter = new events.EventEmitter();
        var j = this.jobManager.push(jobOpt);
        j.on('completed', function (stdout, stderr, jobObject) {
            if (stderr) {
                stderr.on('data', function (buf) {
                    console.log('stderr content : ');
                    console.log(buf.toString());
                });
            }
            var results = { 'input': '' };
            stdout.on('data', function (buf) { results.input += buf.toString(); });
            stdout.on('end', function () {
                if (typeof results !== 'string')
                    results = JSON.stringify(results);
                emitter.emit('jobCompletion', results, jobObject);
            });
        })
            .on('error', function (e, j) {
            console.log('job ' + j.id + ' : ' + e);
            emitter.emit('error', e, j.id);
        });
        return emitter;
    };
    /*
    * DO NOT MODIFY
    * Parse @toParse [string] to find all JSON objects into.
    * Method : look at every character in the string to find the start & the end of JSONs,
    * and then substring according to start & end indices. The substrings are finally converted into JSONs.
    * Returns in @results [literal] a list of JSON objects [@results.jsonTab] and toParse without all JSON substrings [@results.rest].
    * for tests = zede}trgt{"toto" : { "yoyo" : 3}, "input" : "tototo\ntititi\ntatata"} rfr{}ojfr
    */
    Task.prototype.stringToJson = function (toParse) {
        var open = '{', close = '}';
        var jsonStart = -1, jsonEnd = -1;
        var counter = 0;
        var sub_toParse;
        var result = {
            "rest": "",
            "jsonTab": []
        };
        /*
        * Check the existence of a JSON in a string.
        * Method : search the indice of the first { in the string. Then search a } from the indice to the end of the string.
        */
        var jsonAvailable = function (toParse) {
            var open = '{', close = '}';
            // search the first '{'
            var first_open = toParse.search(open);
            if (first_open === -1)
                return false;
            // search a '}' from the first '{' to the end
            var next_close = toParse.substring(first_open).search(close);
            if (next_close === -1)
                return false;
            else
                return true;
        };
        while (jsonAvailable(toParse)) {
            for (var i = 0; i < toParse.length; i++) {
                //console.log(i, toParse[i]);
                if (toParse[i].match(open)) {
                    if (counter === 0)
                        jsonStart = i; // if a JSON is beginning
                    counter++;
                }
                // looking for a } only if a { was found before
                if (toParse[i].match(close) && jsonStart !== -1) {
                    counter--;
                    if (counter === 0) {
                        jsonEnd = i;
                        // prepare the JSON object
                        sub_toParse = toParse.substring(jsonStart, jsonEnd + 1);
                        result.jsonTab.push(JSON.parse(sub_toParse));
                        toParse = toParse.replace(sub_toParse, ''); // remove the part of the JSON already parsed
                        jsonStart = -1, jsonEnd = -1;
                    }
                }
            }
        }
        result.rest += toParse;
        return result;
    };
    /*
    * DO NOT MODIFY
    * Realize all the checks and preparations before running.
    * Steps :
    * 	(1) concatenate @chunk [string] until an input is completed (if we found JSON object(s)).
    * 	(2) then look at every JSON object we found to :
    * 		(3) prepare the task = by setting options & creating files for the task
    * 		(4) check if a previous task was already done :
    * 			(5) if yes -> restore
    * 			(6) if no -> run
    */
    Task.prototype.processing = function (chunk) {
        var _this = this;
        if (!chunk)
            throw 'ERROR : Chunk is ' + chunk; // if null or undefined
        var emitter = new events.EventEmitter();
        this.streamContent += chunk; // (1)
        var resJsonParser = this.stringToJson(this.streamContent); // (1)
        this.streamContent = resJsonParser.rest;
        var jsonTab = resJsonParser.jsonTab;
        console.log('jsonTab :');
        console.dir(jsonTab);
        console.log(this.streamContent);
        jsonTab.forEach(function (jsonValue, i, array) {
            //console.log('######> i = ' + i + '<#>' + jsonValue + '<######');
            if (jsonValue === 'null' || jsonValue === 'null\n') {
                _this.pushClosing();
            }
            else {
                var taskOpt = _this.prepareTask(jsonValue); // (3)
                //console.log(taskOpt);
                var pathRestore = _this._alreadyDone(taskOpt, jsonValue.input); // (4)
                if (pathRestore !== null) {
                    console.log('Restoration process started with the path : ' + pathRestore);
                    _this.async(_this.restoreByPath(pathRestore)).on('end', function (results) {
                        _this.goReading = true;
                        _this.push(results);
                        emitter.emit('restored', results);
                    });
                }
                else {
                    console.log('No equal task found in previous cache directories : go running !');
                    _this.run(taskOpt)
                        .on('jobCompletion', function (results, jobObject) {
                        _this.goReading = true;
                        _this.push(results);
                        emitter.emit('processed', results);
                    })
                        .on('error', function (err) {
                        emitter.emit('err');
                    })
                        .on('endOfStream', function (s) {
                        emitter.emit('endOfStream');
                    });
                }
            }
        });
        return emitter;
    };
    /*
    * DO NOT MODIFY
    * Necessary to use .pipe(task)
    */
    Task.prototype._write = function (chunk, encoding, callback) {
        var _this = this;
        // chunk can be either string or buffer but we need a string
        if (Buffer.isBuffer(chunk))
            chunk = chunk.toString();
        //console.log('>>>>> write');
        this.processing(chunk)
            .on('processed', function (s) {
            _this.emit('processed', s);
        })
            .on('err', function (s) {
            _this.emit('err', s);
        })
            .on('endOfStream', function (s) {
            _this.emit('endOfStream', s);
        })
            .on('restored', function (s) {
            _this.emit('restored', s);
        });
        callback();
        return this;
    };
    /*
    * DO NOT MODIFY
    * Necessary to use task.pipe()
    */
    Task.prototype._read = function (size) {
        //console.log('>>>>> read');
        if (this.goReading) {
            //console.log('>>>>> read: this.goReading is F');
            this.goReading = false;
        }
    };
    /*
    * Try to kill the job(s) of this task
    * WARNING : not implemented
    */
    Task.prototype.kill = function (managerSettings) {
        var emitter = new events.EventEmitter();
        this.jobManager.stop(managerSettings, this.dynamicTag)
            .on('cleanExit', function () {
            emitter.emit('cleanExit');
        })
            .on('exit', function () {
            emitter.emit('exit');
        })
            .on('errScancel', function () {
            emitter.emit('errScancel');
        })
            .on('errSqueue', function () {
            emitter.emit('errSqueue');
        });
        //console.log(emitter);
        return emitter;
    };
    /*
    * Make a @callback asynchronous
    */
    Task.prototype.async = function (callback) {
        var emitter = new events.EventEmitter;
        setTimeout(function () { emitter.emit('end', callback); }, 10);
        return emitter;
    };
    return Task;
}(stream.Duplex));
exports.Task = Task;