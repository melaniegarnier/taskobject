
/*
*********************
***** DUAL TASK *****
*********************

* GOAL *
A dual example of a child Task, that could be chained by .pipe() or .superPipe()

* INPUT *
Coming from a readable stream, the input must be like :
{
    "input" : "pdb into string format"
}
WARNING : "input" is an obligatory key.

* OUTPUT *
The output is a literal with this form :
{
    "input" : '{\n"myData line 1" : "toto"\n}\n'
}
*/


/***** TODO *****
- doc
- mettre en place un commander et une fonction usage pour ce script au cas où

*/


import tk = require ('../index');

declare var __dirname;

export class Dual extends tk.Task {
    public readonly input1;
    public readonly input2;

	/*
	* Initialize the task parameters.
	*/
	public constructor (management: any, options?: any) {
		super(management, options); // constructor of the tk.Task Object
        this.rootdir = __dirname; // always take the current directory of the task...
        this.settFile = this.rootdir + '/../data/settings2.json'; // ... to find the path to the settings file
        this.staticTag = 'dualtask'; // unique !
        
        /* Creation of the slot symbols : only one here */
        this.slotSymbols = ['input1', 'input2'];

        super.init(this.settFile); // always init() with the settings file at the end of the constructor
	}



    /*
    * Here manage the input(s)
    */
    protected prepareJob (inputs: any[]): any {
        return super.configJob(inputs);
    }

    /*
    * To manage the output(s).
    * The "input" key is necessary to run correctly in case of simpleTask_1.pipe(simpleTask_2)
    * because results.input of simpleTask_1 will be used as inputs.input for simpleTask_2. In fact,
    * the coreScript needs an "$input" variable (specified by the sbatch script, thanks to the JM).
    */
    protected prepareResults (chunk: string): {} {
        var results: {} = {
            'input' : chunk
        };
        return results;
    }
}

