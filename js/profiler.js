define(function(){

	// TODO: keep track of min/max outliers (n number of outliers) to remove from avg mean
    // TODO: Would be nice to make groups (eg. Startup group with different startup routines), then when the game is
    // shutdown we could prettyprint all profiles (how much time each group took, and inner recordings within groups).
    //          Group 1:        4ms   [####                    ]  20%
    //          Group 2:        8ms   [########                ]  40%
	var profilesRunning = {},
		profiles = {};

	var Profile = function(label){

		this.label = label;

		this.runs = 0;
		this.mean = 0;
		this.min = 0;
		this.max = 0;
		this.total = 0;
		this.accumulating = false;
		this.savedData = null;

		this.addRun = function(time){

			if (!this.accumulating) {
				if (this.runs == 0) {
					this.mean = time;
					this.runs = 1;
					this.min = time;
					this.max = time;
				} else {
					this.mean = (this.mean * this.runs + time) / (this.runs + 1);
					++this.runs;
					if (time < this.min) this.min = time;
					if (time > this.max) this.max = time;
				}
			}
			this.total += time;
		};

		this.clear = function(){
			this.runs = 0;
			this.mean = 0;
			this.min = 0;
			this.max = 0;
			this.total = 0;
		};

		this.accumulateStart = function(){
			if (this.accumulating) throw new Error("(Profiler) Error: Already accumulating on ("+ this.label +"!");
			this.accumulating = true;
			this.savedData = {
				mean: this.mean,
				min: this.min,
				max: this.max,
				runs: this.runs,
				total: this.total
			};
			
			this.clear();
		};

		this.accumulate = function(){
			this.accumulating = false;

			this.runs = this.savedData.runs + Math.min(1, this.runs);
			if (this.runs == 0) this.runs = 1;
			this.mean = (this.savedData.mean * (this.runs - 1) + this.total) / this.runs;
			this.min  = (this.savedData.min < this.total) ? this.savedData.min : this.total;
			this.max  = (this.savedData.max > this.total) ? this.savedData.max : this.total;
			this.total = this.savedData.total + this.total;
		};
	};


	var Profiler = {

		profile: !Env.game.profile ? (function(){}) : function(label){
			if (!profiles.hasOwnProperty(label)) profiles[label] = new Profile(label);
			if (profilesRunning.hasOwnProperty(label)) return false;
			profilesRunning[label] = profiles[label];
			profiles[label].start = (new Date()).getTime();
		},

		profileEnd: !Env.game.profile ? (function(){}) : function(label){
			if (!profilesRunning.hasOwnProperty(label)) return false;
			var profile = profiles[label],
				time = (new Date()).getTime() - profile.start;
			delete profile.start;
			profile.addRun(time);
			delete profilesRunning[label];
		},

		accumulateStart: !Env.game.profile ? (function(){}) : function(label){
			if (!profiles.hasOwnProperty(label)) profiles[label] = new Profile(label);
			var profile = profiles[label];
			profile.accumulateStart();
		},

		accumulate: !Env.game.profile ? (function(){}) : function(label){
			if (!profiles.hasOwnProperty(label)) return false;
			var profile = profiles[label];
			profile.accumulate();
		},

		report: !Env.game.profile ? (function(){}) : function(label){
			
			if (label == undefined) {

				console.log("Profiler Report");
				console.log("==================");
				for (var label in profiles) {
					this.report(label);
				}
				console.log("==================");
			} else {
				var profile = profiles[label];
				console.log("	"+label+" [ mean: ("+ profile.mean +"ms),  min: ("+ profile.min +"ms),  max: ("+ profile.max +"ms),  total: ("+ (profile.total) +"ms)  runs: "+ profile.runs +"]");
			}
		},

		clear: !Env.game.profile ? (function(){}) : function(label){
			if (!profiles.hasOwnProperty(label)) return false;
			var profile = profiles[label];
			profile.clear();
		}
	};

	return Profiler;
});
