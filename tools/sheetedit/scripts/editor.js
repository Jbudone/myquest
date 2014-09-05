
var Editor = function(container, sheet){

	var interface = {
		loadView: null,
		onModified: new Function(),
	}, view = null,
	   ViewType = function(buttonsContainer, settingsContainer){
		   this.show       = function(){
			   			     	buttonsContainer.removeClass('hidden');
						     	settingsContainer.removeClass('hidden');
		   				     };
		   this.hide       = function(){
			   			     	buttonsContainer.addClass('hidden');
						     	settingsContainer.addClass('hidden');
		   				     };
		   this.loadData   = new Function();  // from data, load into html
		   this.unload     = new Function();
		   this.fetchData  = new Function();  // fetch html into json data
		   this.data       = {};
		   this.components = {};
    }, view_tilesheet   = new ViewType( $('#buttons_tilesheets'), $('#settings_tilesheet') ),
       view_spritesheet = new ViewType( $('#buttons_spritesheets'), $('#settings_spritesheet') ),
	   view_npc         = new ViewType( $('#buttons_npcs'), $('#settings_npcs') );


	// =====================================
	// Prepare Tilesheet View
	// =====================================
	

	// ------------ Components ------------ //

	view_tilesheet.components = {
		id: $('#tilesheet_id'),
		tilesize: {
			input: $('#tilesheet_tilesize'),
			value: $('#tilesheet_tilesize_value')
		},
		showgrid: $('#tilesheet_showgrid'),
		offset: {
			y: $('#tilesheet_offset_y'),
			x: $('#tilesheet_offset_x')
		},
		setCollision: $('#ctrl-collision'),
		setFloating: $('#ctrl-floating')
	};


	view_tilesheet.components.tilesize.input[0].oninput = function(){
		var newTilesize = parseInt(this.value);
		view_tilesheet.data.tilesize = newTilesize;
		view_tilesheet.components.tilesize.value.text( newTilesize );
		interface.onModified();
	};

	view_tilesheet.components.id[0].onchange = function(){
		var newID = this.value;
		view_tilesheet.data.id = newID;
	};

	view_tilesheet.components.showgrid[0].onchange = function(){
		var showgrid = this.checked;
		sheet.gridMode( showgrid );
	};

	view_tilesheet.components.offset.y[0].onchange = function(){
		var offset = parseInt(this.value);
		view_tilesheet.data.offset.y = offset;
		interface.onModified();
	};

	view_tilesheet.components.offset.x[0].onchange = function(){
		var offset = parseInt(this.value);
		view_tilesheet.data.offset.x = offset;
		interface.onModified();
	};

	view_tilesheet.components.setCollision[0].onclick = function(){
		sheet.setMode('collision');
		return false;
	};

	view_tilesheet.components.setFloating[0].onclick = function(){
		sheet.setMode('floating');
		return false;
	};


	// ------------ Loading/Unloading ------------ //

	view_tilesheet.loadData = function(data, linkEl){

		// TODO: setup html from data
		this.data = data;

		view_tilesheet.components.id.val( data.id );

		sheet.loadSheet( data );
		sheet.onModified = function(modified){
			// TODO: transfer modifications
			if (modified.type == 'floating') {
				var _floats = [],
					floats = modified.selection.tiles;
				for (var i=0; i<floats.length; ++i) {
					var float = floats[i],
						_float = float.y * parseInt(view_tilesheet.data.data.columns) + float.x;
					_floats.push( _float );
				}
				view_tilesheet.data.data.floating = _floats;
			}
			linkEl.data('modify')( linkEl );
		};
	};

	view_tilesheet.unload = function(){

		view_tilesheet.components.id.val('');

	};

	view_tilesheet.fetchData = function(){
		return this.data;
	};


	// =====================================
	// Prepare Spritesheet View
	// =====================================
	
	// TODO

	// =====================================
	// Prepare NPC View
	// =====================================
	
	// TODO


	// -------------------------------------------------------------------- //
	// -------------------------------------------------------------------- //
	// -------------------------------------------------------------------- //

	interface.loadView = function(viewType, data, linkEl){

		if (view) {
			view.unload();
			view.hide();
		}

		if (viewType == 'tilesheet') view = view_tilesheet;
		else if (viewType == 'spritesheet') view = view_spritesheet;
		else if (viewType == 'npc') view = view_npc;
		else {
			console.error("Bad view: "+viewType);
			return;
		}

		view.loadData(data, linkEl);
		view.show();
	};



	//> editor.js: load/switch between views (tilesheet/spritesheet/npc/intro); editing (tilesheet drag/drop, edit settings, hook buttons/settings)


	return interface;
};
