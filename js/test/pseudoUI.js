define(['eventful','hookable','loggable'], function(Eventful, Hookable, Loggable){

	var UI = function(){
		extendClass(this).with(Eventful);
		extendClass(this).with(Hookable);
		extendClass(this).with(Loggable);
		this.setLogGroup('UI');
		this.setLogPrefix('(UI) ');


		this.canvas = null;
		this.onMouseMove = new Function();
		this.onMouseDown = new Function();

		this.tileHover = null;
		this.hoveringEntity = null;
		this.hoveringItem = null;
		this.hoveringInteractable = null;

		this.messageBox = null;

		this.pages = {};
		this.camera  = null;

		var _UI = this;
		this.components = {


			// UI attached to a movable
			// Includes: name, health bar
			MovableUI: function(movable){ }
		};

		this.step = function(time){ };
		this.updateCursor = function(){ };
		this.positionFromMouse = function(mouse){ };
		
		this.initialize = function(canvas){ };

		this.postMessage = function(message, messageType){
			console.log(message);
		};

		this.movables = {};

		this.attachMovable = function(entity){ };

		this.updateAllMovables = function(){ };

		this.detachMovable = function(entity){ };

		this.hideMovable = function(entity){ };

		this.showMovable = function(entity){ };

		this.addPage = function(pageID){ };

		this.removePage = function(pageID){ };

		this.updatePages = function(){ };

		this.clear = function(){ };

		this.setPage = function(page){ };

		this.fadeToBlack = function(){ };

		this.fadeIn = function(){ };





		this.registerHook('input')
	};

	return UI;
});

