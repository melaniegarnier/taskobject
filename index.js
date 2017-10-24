"use strict";
/*
* CLASS TASK
* settFile must be like :
{
    "coreScript": "./data/simple.sh",
    "automaticClosure": false,
    "settings": {}
}


* Usage :
var tk = require('taskObject');
var taskTest = new tk.Task (jobManager, jobProfile, syncMode);
readableStream.pipe(taskTest).pipe(writableStream);


* Inheritance :
A child class of Task must not override methods with a "DO NOT MODIFY" indication


*/
Object.defineProperty(exports, "__esModule", { value: true });
// TODO
// - kill method (not necessary thanks to the new jobManager with its "engines")
// - see how to use the "null" value (when we call the pushClosing() method)
// - init() : arguments nommés (soit un JSON soit un string)
// - dans prepareResults() : mettre le stringify dans une autre fonction
const fs = require("fs");
const events = require("events");
const stream = require("stream");
const jsonfile = require("jsonfile");
const JSON = require("JSON");
var b_test = false; // test mode
class Task extends stream.Duplex {
    /*
    * MUST BE ADAPTED FOR CHILD CLASSES
    * Initialize the task parameters with values gived by user.
    */
    constructor(jobManager, jobProfile, syncMode, options) {
        super(options);
        this.jobManager = null; // engineLayer
        this.jobProfile = null; // including partition, qos, uid, gid (given by jobManager)
        this.syncMode = false; // define the mode : async or not (see next line)
        this.processFunc = null; // async (process) or synchronous (syncProcess) depending on the mode
        this.streamContent = ''; // content of the stream (concatenated chunk)
        this.jsonContent = []; // all the whole JSONs found in streamContent
        this.goReading = false; // indicate when the read function can be used
        this.nextInput = false; // false when the input is not complete // usefull ?
        this.slotArray = []; // array of streams, each corresponding to an input (piped on this Task)
        this.jobsRun = 0; // number of jobs that are still running
        this.jobsErr = 0; // number of jobs that have emitted an error
        this.rootdir = __dirname;
        this.settFile = null; // settings file path
        this.coreScript = null; // core script path
        this.settings = null; // specific to each task // usefull ?
        this.staticTag = null; // tagTask : must be unique
        if (typeof jobManager == "undefined")
            throw 'ERROR : a job manager must be specified';
        if (typeof jobProfile == "undefined")
            throw 'ERROR : a job profile must be specified (even null is correct)';
        if (typeof syncMode == "undefined")
            throw 'ERROR : a mode must be specified (sync = true // async = false)';
        this.jobManager = jobManager;
        this.jobProfile = jobProfile;
        this.syncMode = syncMode;
        if (this.syncMode === true)
            this.processFunc = this.syncProcess;
        else
            this.processFunc = this.process;
    }
    /*
    * DO NOT MODIFY
    * To (in)activate the test mode : (in)activate all the console.log/dir
    */
    testMode(bool) {
        b_test = bool;
        if (b_test)
            console.log('NEWS : Task test mode is activated');
        else
            console.log('NEWS : Task test mode is off');
    }
    /*
    * DO NOT MODIFY
    * Initialization of the task : called ONLY by the constructor.
    * @data is either a string which describe a path to a JSON file,
    * or a literal like { 'author' : 'me', 'settings' : { 't' : 5, 'iterations' : 10 } }.
    */
    init(data) {
        if (data) {
            var userData;
            if (typeof data === "string")
                userData = this.parseJsonFile(data);
            else
                userData = data;
            if ('coreScript' in userData)
                this.coreScript = this.rootdir + '/' + userData.coreScript;
            else
                this.coreScript = null;
            if ('automaticClosure' in userData)
                this.automaticClosure = userData.automaticClosure;
            else
                this.automaticClosure = false;
            if ('settings' in userData)
                this.settings = userData.settings;
            else
                this.settings = {};
        }
    }
    /*
    * MUST BE ADAPTED FOR CHILD CLASSES
    * Change task parameters according to @data :
    * @data is either a string which describe a path to a JSON file,
    * or a literal like { 'author' : 'me', 'settings' : { 't' : 5, 'iterations' : 10 } }.
    */
    set(data) {
        if (data) {
            var userData;
            if (typeof data === "string")
                userData = this.parseJsonFile(data);
            else
                userData = data;
            if ('coreScript' in userData)
                this.coreScript = this.rootdir + '/' + userData.coreScript;
            if ('automaticClosure' in userData)
                this.automaticClosure = userData.automaticClosure;
            if ('settings' in userData) {
                for (var key in userData.settings) {
                    if (this.settings.hasOwnProperty(key))
                        this.settings[key] = userData.settings[key];
                    else
                        throw 'ERROR : cannot set the ' + key + ' property which does not exist in this task';
                }
            }
        }
    }
    /*
    * DO NOT MODIFY
    * In anticipation of the unique jobManager processus and its monitor mode.e
    */
    getState() {
        return {
            "staticTag": this.staticTag,
            "syncMode": this.syncMode,
            "jobProfile": this.jobProfile,
            "stillRunning": this.jobsRun,
            "errorEmitted": this.jobsErr
        };
    }
    /*
    * MUST BE ADAPTED FOR CHILD CLASSES
    * NOT USED FOR NOW
    * According to the parameter this.automaticClosure,
    * close definitely this task or just push the string "null"
    */
    pushClosing() {
        if (this.automaticClosure)
            this.push(null);
        else
            this.push('null');
    }
    /*
    * DO NOT MODIFY
    * Pre-processing of the job.
    * Configure the dictionary to pass to the jobManager.push() function, according to :
    * 	(1) the list of the modules needed
    * 	(2) variables to export in the coreScript
    *	(3) the inputs : stream or string or path in an array of JSONs
    */
    configJob(inputs, modules, exportVar) {
        var self = this;
        var jobOpt = {
            'tagTask': self.staticTag,
            'script': self.coreScript,
            'modules': modules,
            'exportVar': exportVar,
            'inputs': self.concatJson(inputs) // (3)
        };
        return jobOpt;
    }
    /*
    * MUST BE ADAPTED FOR CHILD CLASSES
    * Here are defined all the parameters specific to the task :
    * 	- modules needed
    * 	- variables to export in the batch script
    */
    prepareJob(inputs) {
        var modules = [];
        var exportVar = {};
        return this.configJob(inputs, modules, exportVar);
    }
    /*
    * MUST BE ADAPTED FOR CHILD CLASSES
    * To manage the output(s)
    */
    prepareResults(chunk) {
        if (typeof chunk !== 'string')
            chunk = JSON.stringify(chunk);
        var results = {
            'out': chunk
        };
        return JSON.stringify(results);
    }
    /*
    * DO NOT MODIFY
    * Parse @stringT [string] to find all JSON objects into.
    * Method : look at every character in the string to find the start & the end of JSONs,
    * and then substring according to start & end indices. The substrings are finally converted into JSONs.
    * Returns in @results [literal] a list of JSON objects [@results.jsonTab] and @stringT without all JSON substrings [@results.rest].
    * for tests = zede}trgt{"toto" : { "yoyo" : 3}, "input" : "tototo\ntititi\ntatata"} rfr{}ojfr
    */
    findJson(stringT) {
        var toParse = stringT; // copy of string
        var open = '{', close = '}';
        var jsonStart = -1, jsonEnd = -1;
        var counter = 0;
        var sub_toParse;
        var result = {
            "rest": "",
            "jsonTab": []
        };
        /*
        * Check the existence of JSON extremities in @toParse [string].
        * Method :
        * (1) search the indice of the first { in the string
        * (2) search a } from the indice to the end of the string
        */
        var detectExtremities = function (toParse) {
            var open = '{', close = '}';
            var first_open = toParse.search(open); // (1)
            if (first_open === -1)
                return false;
            var next_close = toParse.substring(first_open).search(close); // (2)
            if (next_close === -1)
                return false;
            else
                return true;
        };
        while (detectExtremities(toParse)) {
            counter = 0, jsonStart = -1, jsonEnd = -1;
            for (var i = 0; i < toParse.length; i++) {
                if (b_test) {
                    console.log("i = " + i + " ///// to parse [i] = " + toParse[i] + " ///// counter = " + counter);
                    console.log("jsonStart = " + jsonStart + " ///// jsonEnd = " + jsonEnd);
                }
                if (toParse[i].match(open)) {
                    if (counter === 0)
                        jsonStart = i; // if a JSON is beginning
                    counter++;
                }
                if (toParse[i].match(close) && jsonStart !== -1) {
                    counter--;
                    if (counter === 0) {
                        jsonEnd = i;
                        // prepare the JSON object
                        sub_toParse = toParse.substring(jsonStart, jsonEnd + 1);
                        result.jsonTab.push(this.parseJson(sub_toParse));
                        toParse = toParse.replace(sub_toParse, ''); // remove the part of the JSON already parsed
                        break;
                    }
                }
            }
            if (jsonEnd === -1)
                toParse = toParse.substring(jsonStart + 1); // continue the research without all before the first {
        }
        result.rest += toParse;
        return result;
    }
    /*
    * DO NOT MODIFY
    * Synchronous process method.
    * Use @chunk from @aStream to search for one JSON (at least), and then call the run method.
    */
    syncProcess(chunk, aStream) {
        var emitter = new events.EventEmitter();
        var self = this; // self = this = TaskObject =//= aStream = a slot of self
        self.feed_streamContent(chunk, aStream);
        var numOfRun = -1;
        for (var i in self.slotArray) {
            var slot_i = self.slotArray[i];
            if (b_test) {
                console.log("i : " + i);
                console.log("slotArray[i] : " + slot_i);
            }
            self.feed_jsonContent(slot_i);
            // take the length of the smallest jsonContent :
            if (numOfRun === -1)
                numOfRun = slot_i.jsonContent.length;
            if (slot_i.jsonContent.length < numOfRun)
                numOfRun = slot_i.jsonContent.length;
        }
        if (b_test)
            console.log("numOfRun : " + numOfRun);
        for (var j = 0; j < numOfRun; j++) {
            if (b_test) {
                console.log("%%%%%%%%%%%%% here synchronous process");
                console.log("j : " + j);
            }
            var inputsTab = [];
            for (var k in self.slotArray) {
                inputsTab.push(self.slotArray[k].jsonContent[j]);
            }
            // for tests
            //inputsTab = [ { "inputFile": '{\n"myData line 1" : "titi"\n}\n' }, { "inputFile2": '{\n"myData line 1" : "tata"\n}\n' } ]
            // end of tests
            if (b_test)
                console.log(inputsTab);
            self.run(inputsTab)
                .on('treated', (results) => {
                self.applyOnArray(self.shift_jsonContent, self.slotArray);
                emitter.emit('processed');
            })
                .on('err', (err) => {
                emitter.emit('error');
            });
        }
        return emitter;
    }
    /*
    * DO NOT MODIFY
    * Fill the streamContent of @aStream or @this with @chunk
    */
    feed_streamContent(chunk, aStream) {
        if (typeof chunk == "undefined")
            throw 'ERROR : Chunk is ' + chunk;
        if (Buffer.isBuffer(chunk))
            chunk = chunk.toString(); // chunk can be either string or buffer but we need a string
        var self = this;
        var streamUsed = typeof aStream != "undefined" ? aStream : self;
        streamUsed.streamContent += chunk;
        if (b_test) {
            console.log('streamContent :');
            console.log(streamUsed.streamContent);
        }
    }
    /*
    * DO NOT MODIFY
    * Fill the jsonContent of @aStream or @this thanks to the findJson method.
    */
    feed_jsonContent(aStream) {
        var self = this;
        var streamUsed = typeof aStream != "undefined" ? aStream : self;
        var results = this.findJson(streamUsed.streamContent); // search for JSON
        if (b_test)
            console.log(results);
        if (results.jsonTab.length < 1)
            return; // if there is no JSON at all, bye bye
        streamUsed.jsonContent = streamUsed.jsonContent.concat(results.jsonTab); // take all the JSON detected ...
        streamUsed.streamContent = results.rest; // ... and keep the rest into streamContent
        if (b_test) {
            console.log('jsonContent :');
            console.dir(streamUsed.jsonContent);
        }
    }
    /*
    * DO NOT MODIFY
    * (1) check if the @jsonValue is null to close the stream : not implemented = see TODO
    * (2) prepare the job = by setting options & creating files for the task
    * (3) run
    * (4) receive all the data
    * (5) at the end of the reception, prepare the results & send
    */
    run(jsonValue) {
        var emitter = new events.EventEmitter();
        var self = this;
        // if (jsonValue === 'null' || jsonValue === 'null\n') { // (1)
        // 	self.pushClosing();
        // } else {
        var jobOpt = self.prepareJob(jsonValue); // (2) // jsonValue = array of JSONs
        if (b_test) {
            console.log("jobOpt :");
            console.log(jobOpt);
        }
        var j = self.jobManager.push(self.jobProfile, jobOpt); // (3)
        j.on('completed', (stdout, stderr, jobObject) => {
            if (stderr) {
                stderr.on('data', buf => {
                    console.error('stderr content : ');
                    console.error(buf.toString());
                });
            }
            var chunk = '';
            stdout.on('data', buf => { chunk += buf.toString(); }); // (4)
            stdout.on('end', () => {
                self.async(self.prepareResults(chunk)).on('end', results => {
                    self.goReading = true;
                    self.push(results); // pushing string = activate the "_read" method
                    emitter.emit('treated', results);
                });
            });
        });
        j.on('error', (e, j) => {
            console.log('job ' + j.id + ' : ' + e);
            emitter.emit('error', e, j.id);
        });
        // }
        return emitter;
    }
    /*
    * DO NOT MODIFY
    * (1) use @aStream (first choice) or @this (second choice)
    * (2) consume @chunk
    * (3) look at every JSON object we found into the @jsonContent of @streamUsed
    * (4) treat it
    * (5) remove the jsonContent
    */
    process(chunk, aStream) {
        var emitter = new events.EventEmitter();
        var self = this;
        var streamUsed = typeof aStream != "undefined" ? aStream : self; // (1)
        this.feed_streamContent(chunk, streamUsed); // (2)
        this.feed_jsonContent(streamUsed); // (2)
        streamUsed.jsonContent.forEach((jsonVal, i, array) => {
            if (b_test)
                console.log("%%%%%%%%%%%% hello i am processing asynchronous");
            if (self.syncMode === true) {
                console.log("WARNING : ASYNC process method is running for an object configured in SYNC mode");
                console.log("WARNING : (due to the used of write or pipe method)");
                //console.log(this);
            }
            if (b_test)
                console.log('######> i = ' + i + '<#>' + jsonValue + '<######');
            var jsonValue = [jsonVal]; // to adapt to superProcess modifications
            self.run(jsonValue) // (4)
                .on('treated', (results) => {
                self.shift_jsonContent(streamUsed); // (5)
                emitter.emit('processed');
            })
                .on('err', (err) => {
                emitter.emit('error');
            });
        });
        return emitter;
    }
    /*
    * DO NOT MODIFY
    * Necessary to use anotherTask.pipe(task)
    */
    _write(chunk, encoding, callback) {
        if (b_test)
            console.log('>>>>> write');
        this.process(chunk) // obligatory asynchronous when using a anotherTask.pipe(this)
            .on('processed', s => {
            this.emit('processed', s);
        })
            .on('err', s => {
            this.emit('err', s);
        });
        callback();
        return this;
    }
    /*
    * DO NOT MODIFY
    * Necessary to use task.pipe(anotherTask)
    */
    _read(size) {
        if (b_test)
            console.log('>>>>> read');
        if (this.goReading) {
            if (b_test)
                console.log('>>>>> read: this.goReading is F');
            this.goReading = false;
        }
    }
    /*
    * DO NOT MODIFY
    * Add a slot to the Task on which is realized the superPipe (@s).
    * So @s must be an instance of TaskObject !
    */
    superPipe(s) {
        if (s instanceof Task) {
            s.addSlot(this);
        }
        else {
            throw "ERROR : Wrong use of superPipe method. In a.superPipe(b), b should be an instance of TaskObject";
        }
        return s;
    }
    /*
    * DO NOT MODIFY
    * Slot = a new duplex to receive one type of data
    */
    addSlot(previousTask) {
        class slot extends stream.Duplex {
            constructor(options) {
                super(options);
                this.goReading = false;
                this.streamContent = '';
                this.jsonContent = [];
            }
            _write(chunk, encoding, callback) {
                if (b_test) {
                    console.log("processFunc = ");
                    console.log(self.processFunc);
                }
                self.processFunc(chunk, this)
                    .on('processed', s => {
                    self.emit('processed', s);
                })
                    .on('err', s => {
                    self.emit('err', s);
                });
                callback();
            }
            _read(size) { } // we never use this method but we have to implement it
        }
        var self = this;
        var stream_tmp = new slot();
        self.slotArray.push(stream_tmp);
        previousTask.pipe(stream_tmp);
    }
    /*
    * Try to kill the job(s) of this task
    * WARNING : not implemented :
    jobManager.stop exposes 4 events:
        'cleanExit' : all jobs were succesfully killed
        'leftExit'  : some jobs could not be killed
        'emptyExit' : no jobs  to kill
        'cancelError' : an error occur while killing
        'listError': an error occur  while listing processes corresponding to pending jobs
    */
    kill(managerSettings) {
        console.log('ERROR : The kill method is not implemented yet');
        var emitter = new events.EventEmitter();
        this.jobManager.stop(managerSettings, this.staticTag)
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
        if (b_test)
            console.log(emitter);
        return emitter;
    }
    /*
    * DO NOT MODIFY
    * WARNING : the argument of @myFunc used with @myData must be the first argument given to @myFunc.
    * (1) extract all the arguments (except @myFunc and @myData) to put them into an array = @args
    * (2) check if @myData is an array (true) or not (false) :
    * 	- (3) if TRUE : apply @myFunc on each element of @myData + all the array @args.
    * 	- (4) if FALSE : apply @myFunc on @myData and the @args.
    */
    applyOnArray(myFunc, myData) {
        var self = this;
        var args = Array.prototype.slice.call(arguments, 2); // (1)
        if (Array.isArray(myData)) {
            var results = [];
            for (var i in myData) {
                args.unshift(myData[i]);
                results.push(myFunc.apply(self, args));
            }
            return results;
        }
        else {
            args = args.unshift(myData);
            return myFunc.apply(self, args);
        }
    }
    /*
    * DO NOT MODIFY
    * Concatenate JSONs that are in the same array
    */
    concatJson(jsonTab) {
        var newJson = {};
        for (var i = 0; i < jsonTab.length; i++) {
            for (var key in jsonTab[i]) {
                if (newJson.hasOwnProperty(key))
                    throw 'ERROR with jsonTab in concatJson() : 2 JSON have the same key';
                newJson[key] = jsonTab[i][key];
            }
        }
        if (b_test) {
            console.log("newjson :");
            console.log(newJson);
        }
        return newJson;
    }
    /*
    * DO NOT MODIFY
    * Remove the first element of the jsonContent of @aStream used for the computation.
    */
    shift_jsonContent(aStream) {
        aStream.jsonContent.shift();
    }
    /*
    * DO NOT MODIFY
    * Open a json file and return its content if no error otherwise return null
    */
    parseJsonFile(file) {
        try {
            var dict = jsonfile.readFileSync(file, 'utf8');
            return dict;
        }
        catch (err) {
            console.log('ERROR in parseJsonFile() : ' + err);
            return null;
        }
    }
    /*
    * DO NOT MODIFY
    * Parse @data to check if it is in JSON format.
    */
    parseJson(data) {
        try {
            return JSON.parse(data);
        }
        catch (err) {
            console.log('ERROR in parseJson() : ' + err);
            throw 'WARNING : make sure your data contains well writing \"\\n\" !';
        }
    }
    /*
    * DO NOT MODIFY
    * Make a @callback asynchronous
    */
    async(callback) {
        var emitter = new events.EventEmitter;
        setTimeout(() => { emitter.emit('end', callback); }, 10);
        return emitter;
    }
}
exports.Task = Task;
/*
* DO NOT MODIFY
* Read an @entryFile, replace the real "\n" and "\r" by written "\n" and "\r" (visible into the string).
* Then return the content using a readable stream.
*/
function readEntry(entryFile) {
    try {
        var content = fs.readFileSync(entryFile, 'utf8');
        content = content.replace('\n', '\\n').replace('\r', '\\r');
        var s = new stream.Readable();
        s.push(content);
        s.push(null);
        return s;
    }
    catch (err) {
        console.log('ERROR while opening the file ' + entryFile + ' :');
        console.log(err);
        return null;
    }
}
exports.readEntry = readEntry;
