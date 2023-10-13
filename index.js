var tcp = require('../../tcp');
var udp = require('../../udp');
var instance_skel = require('../../instance_skel');
var debug;
var log;

function instance(system, id, config) {
	let self = this;

	//  Define the connection protocols this module will use:
	self.CONNECT_TCP = 'TCP';
	self.CONNECT_UDP = 'UDP';


	// A promise that's resolved when the socket connects to the matrix.
	self.PromiseConnected = null;

	// super-constructor
	instance_skel.apply(this, arguments);

	self.actions();

	return self;

}


/**
 * The user updated the config.
 * 
 * @param config         The new config object
 */
instance.prototype.updateConfig = function (config) {
	let self = this;

	// Reconnect to the matrix if the IP or protocol changed
	if (self.config.host !== config.host || self.isConnected() === false || self.config.connectionProtocol !== config.connectionProtocol) {
		// Have to set the new host IP/protocol before making the connection.
		self.config.host = config.host;
		self.config.connectionProtocol = config.connectionProtocol;
		self.init_connection();
	}

	// Update the rest of the config
	self.config = config;




	if (self.PromiseConnected) {
		self.PromiseConnected.catch((err) => {
			// Error while connecting. The error message is already logged, but Node requires
			//  the rejected promise to be handled.
		});
	}

	// Rebuild the actions to reflect the capabilities we have.
	self.actions();

};




/**
 * Initializes the module and try to detect capabilities.
 */
instance.prototype.init = function () {
	let self = this;

	debug = self.debug;
	log = self.log;

	let configUpgraded = false;

	// These config options were adding in version 1.2.0 of this module.
	// Set the defaults if not set:

	if (self.config.connectionProtocol === undefined) {
		self.config.connectionProtocol = self.CONNECT_TCP;
		configUpgraded = true;
	}

	if (configUpgraded) {
		self.saveConfig();
	}

	self.init_connection();

};


/**
 * Connect to the matrix over TCP port 5000 or UDP port 50000.
 */
instance.prototype.init_connection = function () {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
	}

	if (!self.config.host) {
		return;
	}

	self.status(self.STATUS_WARNING, 'Connecting');

	self.PromiseConnected = new Promise((resolve, reject) => {

		switch (self.config.connectionProtocol) {
			case self.CONNECT_TCP:
				self.socket = new tcp(self.config.host, 5000, { reconnect_interval: 5000 });
				break;

			case self.CONNECT_UDP:
				self.socket = new udp(self.config.host, 50000);
				self.status(self.STATUS_OK);
				debug('Connected (UDP)');
				break;

		}

		self.socket.on('error', (err) => {

			if (self.currentStatus !== self.STATUS_ERROR) {
				// Only log the error if the module isn't already in this state.
				// This is to prevent spamming the log during reconnect failures.
				debug('Network error', err);
				self.status(self.STATUS_ERROR, err);
				self.log('error', `Network error: ${err.message}`);
			}

			reject(err);

		});

		self.socket.on('connect', () => {
			// This event only fires for TCP connections.
			self.status(self.STATUS_OK);
			debug('Connected (TCP)');
			resolve();
		});


		if (self.config.connectionProtocol === self.CONNECT_UDP) {
			// Auto-resolve the promise if this is a UDP connection.
			resolve();
		}


	}).catch((err) => {
		// The error is already logged, but Node requires all rejected promises to be caught.
	});

	self.socket.on('status_change', (status, message) => {
		self.status(status, message);
	});

	self.socket.on('data', (data) => {
		// Note: 'data' is an ArrayBuffer

		if (typeof data !== 'object' || data.length < 4) {
			// Unknown or invalid response
			return;
		}

		// data may come in as a multiline response to the request. Handle
		//  each line separately.
		data = data.toString().split("\r\n");

		for (var i = 0; i < data.length; i++) {
			if (data[i].length !== 0) {
				self.receivedData3000(data[i]);
			}
		}

	});

};


/**
 * Handles a response from a Protocol 3000 matrix.
 * 
 * @param data     The data received from the matrix (string)
 */
instance.prototype.receivedData3000 = function (data) {
	var self = this;

	// Response will look like: ~01@COMMAND PARAMETERS
	var response = data.match(/^~\d+@([\w-]+)\s(.*)/);
	if (response === null || response.length !== 3) {
		// Bad response. Log and abort.
		self.log('error', `Error parsing response: ${data}`);
		return;
	}

	switch (response[1]) {
		case 'INFO-IO':
			// response[2] will look like: IN 11,OUT 9
			var io = response[2].match(/IN (\d+),OUT (\d+)/);
			if (io === null || io.length !== 3) {
				self.log('error', 'Error parsing input/output response.');
			}

			if (self.config.inputCount === 0) {
				self.log('info', `Detected: ${io[1]} inputs.`);
				self.config.inputCount = parseInt(io[1]);
			}
			if (self.config.outputCount === 0) {
				self.log('info', `Detected: ${io[2]} outputs.`);
				self.config.outputCount = parseInt(io[2]);
			}
			break;

		case 'INFO-PRST':
			// response[2] will look like: VID 60,AUD 0. Only care about video presets.
			var prst = response[2].match(/VID (\d+)/);
			if (prst === null || prst.length !== 2) {
				self.log('error', 'Error parsing presets response.');
			}

			if (self.config.setupsCount === 0) {
				self.log('info', `Detected: ${prst[1]} presets.`);
				self.config.setupsCount = parseInt(prst[1]);
			}
			break;

	}

};


/**
 * Sends the command to the Kramer matrix.
 * 
 * @param cmd      The command to send (ArrayBuffer)
 * @returns        Success state of writing to the socket
 */
instance.prototype.send = function (cmd) {
	let self = this;

	if (self.isConnected()) {
		debug('sending', cmd, 'to', self.config.host);
		return self.socket.send(cmd);
	} else {
		debug('Socket not connected');
	}

	return false;

};


/**
 * Returns if the socket is connected.
 * 
 * @returns      If the socket is connected
 */
instance.prototype.isConnected = function () {
	let self = this;

	switch (self.config.connectionProtocol) {
		case self.CONNECT_TCP:
			return self.socket !== undefined && self.socket.connected;

		case self.CONNECT_UDP:
			return self.socket !== undefined;

	}

	return false;

};


/**
 * Return config fields for web config.
 * 
 * @returns      The config fields for the module
 */
instance.prototype.config_fields = function () {
	let self = this;
	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: "This module works with the Kramer VS-411XS Switcher using Protocol 3000"
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Target IP',
			width: 4,
			regex: self.REGEX_IP
		},
		{
			type: 'dropdown',
			id: 'connectionProtocol',
			label: 'TCP or UDP',
			default: self.CONNECT_TCP,
			width: 4,
			choices: [
				{ id: self.CONNECT_TCP, label: 'TCP (Port 5000)' },
				{ id: self.CONNECT_UDP, label: 'UDP (Port 50000)' }
			]
		},
	]
};


/**
 * Cleanup when the module gets deleted.
 */
instance.prototype.destroy = function () {
	let self = this;
	debug('destroy', self.id);

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
	}

};


/**
 * Creates the actions for this module.
 */
instance.prototype.actions = function (system) {
	let self = this;

	self.setActionDefinitions({
		'switch_audio': {
			name: 'Switch Audio',
			options: [
				{
					type: 'dropdown',
					label: 'Input #',
					id: 'input',
					default: '0',
					choices: [
						{ id: '1', label: '1' },
						{ id: '2', label: '2' },
						{ id: '3', label: '3' },
						{ id: '4', label: '4' }
					]
				}
			],
			callback: (event) => {
				self.send(`#ROUTE 2,1,${options.input}\r`);
			}
		},
		'switch_video': {
			name: 'Switch Video',
			options: [
				{
					type: 'dropdown',
					label: 'Input #',
					id: 'input',
					default: '0',
					choices: [
						{ id: '1', label: '1' },
						{ id: '2', label: '2' },
						{ id: '3', label: '3' },
						{ id: '4', label: '4' }
					]
				}
			],
			callback: (event) => {
				self.send(`#ROUTE 1,1,${options.input}\r`);
			}
		},
		'switch_video_dynamic': {
			name: 'Switch Video (Dynamic)',
			options: [
				{
					type: 'textInput',
					label: 'Input #',
					id: 'input',
					default: '0',
					regex: '/^\\d*$/',
					useVariables: true
				}
			],
			callback: (event) => {
				let input = await self.parseVariablesInString(options.input);
				if (isNaN(input)) {
					self.log('error', `Cannot parse '${input}' as a number. Skipping action.`);
				} else {
					self.send(`#ROUTE 1,1,${input}\r`);
				}
			}
		},
		'switch_audio_dynamic': {
			name: 'Switch Audio (Dynamic)',
			options: [
				{
					type: 'textInput',
					label: 'Input #',
					id: 'input',
					default: '0',
					regex: '/^\\d*$/',
					useVariables: true
				}
			],
			callback: (event) => {
				let input = await self.parseVariablesInString(options.input);
				if (isNaN(input)) {
					self.log('error', `Cannot parse '${input}' as a number. Skipping action.`);
				} else {
					self.send(`#ROUTE 2,1,${options.input}\r`);
				}
			}
		}
	});

};


/**
 * Executes the action and sends the TCP packet to the Kramer matrix.
 * 
 * @param action      The action to perform
 */
instance.prototype.action = function (action) {
	let self = this;
	let cmd = undefined;


	// Clone 'action.options', otherwise reassigning the parsed variables directly will push
	//  them back into the config, because that's done by reference.
	let opt = JSON.parse(JSON.stringify(action.options));

	// Loop through each option for this action, and if any appear to be variables, parse them
	//  and reassign the result back into 'opt'.
	for (const key in opt) {
		let v = opt[key];
		if (typeof v === 'string' && v.includes('$(')) {
			self.system.emit('variable_parse', v, parsed => v = parsed.trim());
			if (v.match(/^\d+$/)) {
				opt[key] = v;
			} else {
				self.log('error', `Cannot parse '${v}' in '${action.action}.${key}' as a number. Skipping action.`);
				return;
			}
		}
	}

	switch (action.action) {
		case 'switch_audio':
			cmd = self.makeCommand(self.SWITCH_AUDIO, opt.input + 1, '1');
			break;

		case 'switch_video':
			cmd = self.makeCommand(self.SWITCH_VIDEO, opt.input + 1, '1');
			break;

		case 'switch_audio_dynamic':
			cmd = self.makeCommand(self.SWITCH_AUDIO, opt.input, '1');
			break;

		case 'switch_video_dynamic':
			cmd = self.makeCommand(self.SWITCH_VIDEO, opt.input, '1');
			break;


	}

	if (cmd) {
		self.send(cmd);
	}

};


/**
 * Formats the command as per the Kramer 2000 protocol.
 * 
 * @param instruction    String or base 10 instruction code for the command
 * @param paramA         String or base 10 parameter A for the instruction
 * @param paramB         String or base 10 parameter B for the instruction
 * @param paramC         String or base 10 parameter C for the instruction
 * @param paramD         String or base 10 parameter D for the instruction
 * @returns              The built command to send
 */
instance.prototype.makeCommand = function (instruction, paramA, paramB, paramC, paramD) {
	let self = this;

	switch (instruction) {
		case self.AUDIO_LEVEL:
			return `#AUD-LVL 1,1,${paramA}\r`

		case self.SWITCH_AUDIO:
			return `#ROUTE 2,1,${paramA}\r`;

		case self.SWITCH_VIDEO:
			return `#ROUTE 1,1,${paramA}\r`;

		case self.AUDIO_MUTE:
			return `#MUTE 1,${paramA}\r`;

		case self.VIDEO_MUTE:
			return `#VMUTE 1,${paramA}\r`;
	}

};


instance_skel.extendedBy(instance);
exports = module.exports = instance;
