// Constant
var SERVER_ADDR  = "";
var RAW_DATA_WINDOW_LEN = 1024;
var NUM_PRODUCT = 3;
var RECORDING_TIME = 5; // second
var GOOD_SIGNAL_THRESHOLD = 20;
var STATE = {
	"DUMMY"		: 0,
	"IDLE"		: 1,
	"TORECORD" 	: 2,
	"RECORDING"	: 3,
	"TOPROCESS"	: 4,
	"TOPOST"	: 5
}
var SIGNAL_STATE = {
	"GOOD"	: "ok",
	"POOR"	: "poor",
	"BREAK"	: "failed",
}

// Global variable
var Client = require('node-rest-client').Client;
var client = new Client();

var Mindwave = require('./index.js');
var mw = new Mindwave();

var curState = STATE.DUMMY;
var curSignal = SIGNAL_STATE.BREAK;

var curUser = { "id": "default" };
var curProduct = -1;
var brainDataArr = [];
var rawDataWindow = [];
var eegData = new EEGData();


///////////////////////////////////////////////////////
// Initialize 
function setup(){
	client.registerMethod("postDataAggregrate", SERVER_ADDR + "/api/brainwave", "POST");
	client.registerMethod("postSignalState", SERVER_ADDR + "/api/signal", "POST");
	client.registerMethod("getProductID", SERVER_ADDR + "/api/project", "GET");

	client.registerMethod("postBrainData", SERVER_ADDR + "/api/streamingwave", "POST");
	client.registerMethod("postRawWave", SERVER_ADDR + "/api/raw", "POST");

	for (var i = 0; i < RAW_DATA_WINDOW_LEN; i++)
		rawDataWindow.push(0);

	mw.connect('COM3');
}
setup();

// Infinite Loop
function MainLoop(){
	postSignal();
	checkID();
	checkState();

	switch(curState){
		case STATE.TORECORD:
			curState = STATE.RECORDING;
			startRecording(RECORDING_TIME);
			break;

		case STATE.TOPROCESS:
			processData();
			break;

		case STATE.TOPOST:
			if (curProduct == NUM_PRODUCT)
				postResult();
			curState = STATE.DUMMY;
			break;

		default:
			break;
	}

	MainTimer = setTimeOut(MainLoop, 500);
};
MainLoop();


///////////////////////////////////////////////////////
// [Class] User
function User(id, gender, age){
	this.id 		= id;
	this.gender 	= gender;
	this.age 		= age;
	this.brainData 	= [];
	this.feature	= {};
}

User.prototype.exportBrainData = function(){
	var tmp = {
		"userID" 	: this.id,
		"userType" 	: this.getUserType(),
		"data"		: this.brainData
	}
	return tmp;
}

User.prototype.getUserType = function(){
	// TODO: From feature to type
	var type = Math.ceil(Math.random() * 4);
	return type;
}


///////////////////////////////////////////////////////
// [Class] EEGData
function EEGData(){
	this.attention 	= 0;
	this.meditation = 0;
	this.alpha1		= 0;
	this.alpha2		= 0;
	this.beta1		= 0;
	this.beta2		= 0;
	this.gamma1		= 0;
	this.gamma2		= 0;
	this.theta		= 0;
	this.delta		= 0;
}

EggData.prototype.clone = function(){
	return Object.assign({}, this);
}

EggData.prototype.add = function(other){
	for (prop in this){
		if (this.hasOwnProperty(prop))
			this.prop = this.prop + other.prop;
	}
}

EggData.prototype.divide = function(number){
	for (prop in this){
		if (this.hasOwnProperty(prop))
			this.prop = this.prop / number;
	}
}

EggData.prototype.check = function(){
	var tmp = 1;
	for (prop in this){
		if (this.hasOwnProperty(prop))
			tmp = tmp * this.prop;
	}
	if (tmp > 0)
		return true;
	else
		return false; 
}


///////////////////////////////////////////////////////
// Function
function checkID(){
	client.methods.getProductID(function(data, response){
		if (curUser.id != data.userID){
			curUser = new User(data.userID, data.userGender, data.userAge);
			curProduct = -1;
			curState = STATE.IDLE
		}

		if (curProduct != data.productID){
			curProduct = data.productID;
			brainDataArr.length = 0;
			for (var i = 0; i < RAW_DATA_WINDOW_LEN; i++)
				rawDataWindow[i] = 0;
		}
	});
}

function checkState(){
	// TODO: Trigger recording monent
	if (curState == STATE.IDLE){
		curState = STATE.DUMMY;
		setTimeOut(function(){curState = STATE.TORECORD;}, 2000);
	}
}

function recordLoop(howLong){
	brainDataArr.push(eegData.clone());
	if (howLong < 0){
		curState = STATE.TOPROCESS;
		console.log("[State] Finish Recording");
		return;
	}

	setTimeOut(recordLoop(howLong-1), 1000);
}

function startRecording(howLong){
	console.log("[State] Start Recording");
	curState = STATE.RECORDING;
	recordLoop(howLong);
}

function postResult(){
	var args = {
		"data"		: curUser.exportBrainData(),
		"headers"	: "Brain data"
	}
	client.postBrainData(args, function(data, response){
		console.log(data);
	})
	console.log("[State] Post Data");
}

function postSignal(){
	var args = {
		"data"		: curSignal,
		"headers"	: "Wave signal"
	}
	client.postSignalState(args, function(data), response){
		console.log(data);
	});
}

function processData(){
	var avg = new EEGData();
	for (var i = 0; i < brainDataArr.length; i++){
		avg.add(brainDataArr[i]);
	}
	avg.divide(brainDataArr.length);
	// TODO: processing data & get score
	avg.score = Math.ceil(Math.random() * 70) + 30;

	curUser.brainData.push(avg);
	curState = STATE.TOPOST;
	console.log("[State] Finish Processing");
}


///////////////////////////////////////////////////////
// Event
mw.on('eeg', function(eeg){
	eegData.alpha1 	= eeg.loAlpha;
	eegData.alpha2 	= eeg.hiAlpha;
	eegData.beta1	= eeg.loBeta;
	eegData.beta2	= eeg.hiBeta;
	eegData.gamma1	= eeg.loGamma;
	eegData.gamma2	= eeg.hiGamma;
	eegData.theta	= eeg.theta;
	eegData.delta	= eeg.delta;
});

mw.on('singal', function(signal){
	if (signal == 200)
		curSignal = SIGNAL_STATE.BREAK;
	else if(signal < GOOD_SIGNAL_THRESHOLD && eegData.check()){
		curSignal = SIGNAL_STATE.GOOD;
	}
	else
		curSignal = SIGNAL_STATE.POOR;
	console.log(signal);
});

mw.on('attention', function(attention)){
	eegData.attention = attention;
};

mw.on('meditation', function(meditation){
	eegData.meditation = meditation;
});

mw.on('blink', function(blink){
	// TODO: Unknown
});

mw.on('wave', function(wave)){
	rawDataWindow.shift();
	rawDataWindow.push(wave);
}