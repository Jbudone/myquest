
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
		   this.modified   = new Function();
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
		sheet_offset: {
			y: $('#tilesheet_sheet_offset_y'),
			x: $('#tilesheet_sheet_offset_x')
		},
		objects: {
			container: $('.objects_list')
        },
        setObjects: $('#ctrl-objects')
	};

    for (var tileType in assetDetails.tileTypes) {
        view_tilesheet.components['set'+tileType] = $('#ctrl-'+tileType);
    }


	view_tilesheet.components.tilesize.input[0].min = 1;
	view_tilesheet.components.tilesize.input[0].max = 1000;
	view_tilesheet.components.tilesize.input[0].oninput = null;
	view_tilesheet.components.tilesize.input[0].oninput = function(){
		var newTilesize = parseInt(this.value);
		view_tilesheet.data.tilesize = newTilesize;
		view_tilesheet.components.tilesize.value.text( newTilesize );
		sheet.adjustSheet( view_tilesheet.data );
		interface.onModified();
		view_tilesheet.modified();
	};

	view_tilesheet.components.id[0].oninput = null;
	view_tilesheet.components.id[0].oninput = function(){
		var newID = this.value;
		view_tilesheet.data.id = newID;
		view_tilesheet.linkEl.text( newID );
		interface.onModified();
		view_tilesheet.modified();
	};

	view_tilesheet.components.showgrid[0].onchange = null;
	view_tilesheet.components.showgrid[0].onchange = function(){
		var showgrid = this.checked;
		sheet.gridMode( showgrid );
	};

	view_tilesheet.components.sheet_offset.y[0].oninput = null;
	view_tilesheet.components.sheet_offset.y[0].oninput = function(){
		var offset = parseInt(this.value);
		view_tilesheet.data.sheet_offset.y = offset;
		sheet.adjustSheet( view_tilesheet.data );
		interface.onModified();
		view_tilesheet.modified();
	};

	view_tilesheet.components.sheet_offset.x[0].oninput = null;
	view_tilesheet.components.sheet_offset.x[0].oninput = function(){
		var offset = parseInt(this.value);
		view_tilesheet.data.sheet_offset.x = offset;
		sheet.adjustSheet( view_tilesheet.data );
		interface.onModified();
		view_tilesheet.modified();
	};

    view_tilesheet.components.setObjects[0].onclick = function(){
        sheet.setMode('objects');
        return false;
    };

    _.forEach(assetDetails.tileTypes, (v, tileType) => {
        view_tilesheet.components['set'+tileType][0].onclick = function(){
            sheet.setMode(tileType);
            return false;
        };
    });


	// ------------ Loading/Unloading ------------ //

	view_tilesheet.loadData = function(data, linkEl){

		this.data = data;
		if (!data.data) data.data = {};
        if (!data.data.objects) data.data.objects = {};

        for (var tileType in assetDetails.tileTypes) {
            if (!(tileType in data.data)) data.data[tileType] = [];
        }

		view_tilesheet.components.id.val( data.id );
		view_tilesheet.components.tilesize.input.val( parseInt(data.tilesize) );
		view_tilesheet.components.tilesize.value.text( parseInt(data.tilesize) );
		view_tilesheet.components.sheet_offset.x.val( parseInt(data.sheet_offset.x) );
		view_tilesheet.components.sheet_offset.y.val( parseInt(data.sheet_offset.y) );

		view_tilesheet.modified = function(){
			linkEl.data('modify')( linkEl );
		};

		view_tilesheet.linkEl = linkEl;

		sheet.loadSheet( data );
		sheet.onModified = function(modified){
			if (modified.type == 'objects') {

				var itemName = 'itm_id';

				// Transpose the objects
				var objectsByName = {},
					idNum = 0;
				for (var objCoord in view_tilesheet.data.data.objects) {
					objectsByName[ view_tilesheet.data.data.objects[objCoord] ] = objCoord;
					++idNum;
				}

				var objects = modified.selection.tiles;
				for (var i=0; i<objects.length; ++i) {
					var object = objects[i],
                        ts = parseInt(view_tilesheet.data.tilesize),
                        ty = object.y / ts,
                        tx = object.x / ts,
						_object = ty * parseInt(view_tilesheet.data.columns) + tx;
					if (!view_tilesheet.data.data.objects[_object]) {
						// This is a new object
						++idNum;
						while (objectsByName[ itemName + idNum ]) ++idNum;
						view_tilesheet.data.data.objects[ _object ] = itemName + idNum;
						objectsByName[ itemName + idNum ] = _object;
						addObject(itemName + idNum, _object);
					}
				}
            } else if (modified.type in assetDetails.tileTypes) {
                let _tiles = [],
                    tiles = modified.selection.tiles;
				for (var i=0; i<tiles.length; ++i) {
					let tile = tiles[i],
                        tx = tile.x / tile.w,
                        ty = tile.y / tile.h,
                        coord = ty * parseInt(view_tilesheet.data.columns) + tx;
					_tiles.push(coord);
				}
				view_tilesheet.data.data[modified.type] = _tiles;
            }
			view_tilesheet.modified();
		};
		sheet.onSheetChanged = function(src){
			data.image = src;
			view_tilesheet.modified();
		};

		var addObject = function(name, coord) {

			var loadObject = function(el){

			}, clearObject = function(el){

				var name = $(el).data('objectName'),
					coord = $(el).data('objectCoord');
				delete view_tilesheet.data.data.objects[coord];

				sheet.removeObject(coord);
				$(el).parent().remove();
				interface.onModified();
				view_tilesheet.modified();
			
			}, renameObject = function(el){

				var coord = $(this).data('objectCoord');
				view_tilesheet.data.data.objects[coord] = $(this).val();
				interface.onModified();
				view_tilesheet.modified();

			}, objectEl = $('<div/>')
							.addClass('object')
							.append( $('<a/>').append(
										$('<input/>')
										.addClass('object_title')
										.val( name )
										.data('objectName', name)
										.data('objectCoord', coord)
										.on('input', renameObject) )
									.attr('href','')
								    .on('click', function(){
									   return false;
									}) )
							.append( $('<a/>')
									.addClass('object_remove')
									.attr('href','')
									.text('X')
									.data('objectName', name)
									.data('objectCoord', coord)
									.click(function(){
										clearObject($(this));
										return false;
									}) );


			view_tilesheet.components.objects.container.append( objectEl );

			return objectEl;

		};

		_.each(data.data.objects, function(objectName, objectCoordinate){
			var objectEl = addObject(objectName, objectCoordinate);
		});
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
	
	

	// ------------ Components ------------ //

	view_spritesheet.components = {
		id: $('#spritesheet_id'),
		showgrid: $('#spritesheet_showgrid'),
		sheet_offset: {
			y: $('#spritesheet_sheet_offset_y'),
			x: $('#spritesheet_sheet_offset_x')
		},
		sprite_offset: {
			y: $('#spritesheet_sprite_offset_y'),
			x: $('#spritesheet_sprite_offset_x')
		},
		sprite_size: {
			w: $('#spritesheet_sprite_size_w'),
			h: $('#spritesheet_sprite_size_h')
		},
		animations: {
			container: $('.animation_list'),
			settings: {
				container: $('.animation_settings'),
                preview: $('#animation_preview'),
				id: $('#animation_id'),
                x: $('#animation_x'),
                y: $('#animation_y'),
                w: $('#animation_w'),
                h: $('#animation_h'),
                l: $('#animation_l'),
				flipX: $('#animation_flipX')
			}, list: []
		},
		setAvatar: $('#ctrl-avatar'),
		setAnimation: $('#ctrl-animation')
	};


	view_spritesheet.components.id[0].oninput = null;
	view_spritesheet.components.id[0].oninput = function(){
		var newID = this.value;
		view_spritesheet.data.id = newID;
		view_spritesheet.linkEl.text( newID );
		interface.onModified();
		view_spritesheet.modified();
	};

	view_spritesheet.components.sheet_offset.y[0].oninput = null;
	view_spritesheet.components.sheet_offset.y[0].oninput = function(){
		var offset = parseInt(this.value);
		view_spritesheet.data.sheet_offset.y = offset;
		sheet.adjustSheet( view_spritesheet.data );
		interface.onModified();
		view_spritesheet.modified();
	};

	view_spritesheet.components.sheet_offset.x[0].oninput = null;
	view_spritesheet.components.sheet_offset.x[0].oninput = function(){
		var offset = parseInt(this.value);
		view_spritesheet.data.sheet_offset.x = offset;
		sheet.adjustSheet( view_spritesheet.data );
		interface.onModified();
		view_spritesheet.modified();
	};

	view_spritesheet.components.sprite_offset.y[0].oninput = null;
	view_spritesheet.components.sprite_offset.y[0].oninput = function(){
		var offset = parseInt(this.value);
		view_spritesheet.data.sprite_offset.y = offset;
		sheet.adjustSheet( view_spritesheet.data );
		interface.onModified();
		view_spritesheet.modified();
	};

	view_spritesheet.components.sprite_offset.x[0].oninput = null;
	view_spritesheet.components.sprite_offset.x[0].oninput = function(){
		var offset = parseInt(this.value);
		view_spritesheet.data.sprite_offset.x = offset;
		sheet.adjustSheet( view_spritesheet.data );
		interface.onModified();
		view_spritesheet.modified();
	};

	view_spritesheet.components.sprite_size.w[0].oninput = null;
	view_spritesheet.components.sprite_size.w[0].oninput = function(){
		var width = parseInt(this.value);
		view_spritesheet.data.sprite_size.w = width;
		sheet.adjustSheet( view_spritesheet.data );
		interface.onModified();
		view_spritesheet.modified();
	};

	view_spritesheet.components.sprite_size.h[0].oninput = null;
	view_spritesheet.components.sprite_size.h[0].oninput = function(){
		var height = parseInt(this.value);
		view_spritesheet.data.sprite_size.h = height;
		sheet.adjustSheet( view_spritesheet.data );
		interface.onModified();
		view_spritesheet.modified();
	};

	view_spritesheet.components.setAvatar[0].onclick = null;
	view_spritesheet.components.setAvatar[0].onclick = function(){
		sheet.setMode('avatar');
		return false;
	};

	view_spritesheet.components.setAnimation[0].onclick = null;
	view_spritesheet.components.setAnimation[0].onclick = function(){
		// sheet.setMode('animation');
		return false;
	};


	// ------------ Loading/Unloading ------------ //

	view_spritesheet.loadData = function(data, linkEl){

		this.data = data;
		if (!data.data) data.data = {};
		if (!data.data.animations) data.data.animations = {};
		if (!data.data.avatar) data.data.avatar = {
              "x": 0,
              "y": 0,
              "w": 64,
              "h": 64
        };

		view_spritesheet.components.id.val( data.id );
		view_spritesheet.components.sheet_offset.x.val( parseInt(data.sheet_offset.x) );
		view_spritesheet.components.sheet_offset.y.val( parseInt(data.sheet_offset.y) );
		view_spritesheet.components.sprite_offset.x.val( parseInt(data.sprite_offset.x) );
		view_spritesheet.components.sprite_offset.y.val( parseInt(data.sprite_offset.y) );
		view_spritesheet.components.sprite_size.w.val( parseInt(data.sprite_size.w) );
		view_spritesheet.components.sprite_size.h.val( parseInt(data.sprite_size.h) );

		$('.animation', view_spritesheet.components.animations.container).remove();

		view_spritesheet.linkEl = linkEl;

		view_spritesheet.components.setAnimation[0].onclick = null;
		view_spritesheet.components.setAnimation[0].onclick = function(){
			var animationName = 'New Animation',
				animation = {
                    x: 0,
                    y: 0,
                    w: 64, // FIXME: Use what ever the last animation has for w/h
                    h: 64,
                    l: 1,
                    flipX: false
				};

			data.data.animations[animationName] = animation;
			var animationEl = addAnimation(animationName, animation);
			$('.animation_title', animationEl).click(); // Load animation
			interface.onModified();
			view_spritesheet.modified();
			return false;
		};

		var addAnimation = function(name, animData){

				var loadAnimation = function(el){

					var name = $(el).data('animationName'),
						animation  = $(el).data('animation');

                    const settingsComponents = view_spritesheet.components.animations.settings;
                    _.forEach(
                        {
                            'x': animation.x,
                            'y': animation.y,
                            'w': animation.w,
                            'h': animation.h,
                            'l': animation.l
                        },
                    (prop, name) => {
                        const component = settingsComponents[name];
                        component.val( prop );
                        component[0].oninput = null;
                        component[0].oninput = function(){
                            animation[name] = parseInt(this.value);
                            sheet.modifyAnimation(animation);
                            interface.onModified();
                            view_spritesheet.modified();
                        };
                    });

                    settingsComponents.id.val( name );
					settingsComponents.id[0].oninput = null;
					settingsComponents.id[0].oninput = function(){
						var newID = this.value;
						delete data.data.animations[ name ];
						name = newID;
						$(el).data('animationName', name);
						$('.animation_remove', $(el).parent()).data('animationName', name);
						data.data.animations[ name ] = animation;
						$(el).text( newID );
						sheet.setMode('animation', name); // update sheet animation ptr since name has changed
						interface.onModified();
						view_spritesheet.modified();
					};

                    settingsComponents.flipX.prop('checked', !!animation.flipX);
					settingsComponents.flipX[0].onclick = null;
					settingsComponents.flipX[0].onclick = function(){
						var flipX = this.checked;
						if (flipX) {
							animation.flipX = true;
						} else {
							delete animation.flipX;
						}
						interface.onModified();
						view_spritesheet.modified();
					};

					sheet.setMode('animation', name);
                    setAnimationPreview(data, animation);

					return false;
				}, clearAnimation = function(el){
					// var animationList = view_spritesheet.components.animations.list,
					var name = $(el).data('animationName');
					// for (var i=0; i<animationList.length; ++i) {
					// 	var _animation = animationList[i];
					// 	if (_animation.name == name) {
					// 		animationList.splice(i, 1);
					// 		break;
					// 	}
					// }
					delete view_spritesheet.data.data.animations[name];

					sheet.removeAnimation(name);
					$(el).parent().remove();
					interface.onModified();
					view_spritesheet.modified();
				}, animationEl = $('<div/>')
								.addClass('animation')
								.append( $('<a/>')
										.addClass('animation_title')
										.attr('href','')
										.text( name )
										.data('animation', animData)
										.data('animationName', name)
										.click(function(){
											loadAnimation($(this));
											return false;
										}) )
								.append( $('<a/>')
										.addClass('animation_remove')
										.attr('href','')
										.text('X')
										.data('animation', animData)
										.data('animationName', name)
										.click(function(){
											clearAnimation($(this));
											return false;
										}) );


				view_spritesheet.components.animations.container.append( animationEl );
				// view_spritesheet.components.animations.list.push( animData );

				return animationEl;
		};


		_.each(data.data.animations, function(animation, animationName){
			var animationEl = addAnimation(animationName, animation);
		});
		// for (var animationName in data.data.animations) {
		// 	var animation = data.data.animations[animationName],
		// 		animationEl = addAnimation(animationName, animation);
		// }

		view_spritesheet.modified = function(){
			linkEl.data('modify')( linkEl );
		};

		sheet.loadSheet( data );
		sheet.onModified = function(modified){
			if (modified.type == 'animation') {
				// TODO: animation
				// var _animations = [],
				// 	animation = modified.selection.tiles;
				// for (var i=0; i<floats.length; ++i) {
				// 	var float = floats[i],
				// 		_float = float.y * parseInt(view_tilesheet.data.data.columns) + float.x;
				// 	_floats.push( _float );
				// }
				// view_tilesheet.data.data.floating = _floats;
            } else if (modified.type == 'avatar') {
                const tile = modified.selection.tiles[0],
                    tilesize = parseInt(view_spritesheet.data.tilesize),
                    tx = tile.x / tilesize,
                    ty = tile.y / tilesize,
                    tw = sheet.size().width / tilesize;
                view_spritesheet.data.data.avatar = ty * tw + tx;
            }

			view_spritesheet.modified();
		};
		sheet.onSheetChanged = function(src){
			data.image = src;
			view_spritesheet.modified();
		};

        setAnimationPreview(data);
	};

	view_spritesheet.unload = function(){

		view_spritesheet.components.id.val('');

	};

	view_spritesheet.fetchData = function(){
		return this.data;
	};

    var animPreview = {
        drawTimeout: null
    };

    var setAnimationPreview = function(data, anim){
        let canvas = $('#animation_preview')[0],
            ctx = canvas.getContext('2d');

        clearTimeout(animPreview.drawTimeout);
        animPreview.drawTimeout = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let idx = 0;

        var redraw = () => {

            let x = parseInt(anim.x, 10),
                y = parseInt(anim.y, 10),
                w = parseInt(anim.w, 10),
                h = parseInt(anim.h, 10),
                l = parseInt(anim.l, 10);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(tilesheet, x + w * idx, y, w, h, 0, 0, data.sprite_size.w, data.sprite_size.h);

            ++idx;
            if (idx >= anim.l) {
                idx = 0;
            }

            animPreview.drawTimeout = setTimeout(redraw, 100);
        };

        let tilesheet = new Image();
        tilesheet.onload = function(){
            if (animPreview.drawTimeout !== null) return;
            if (!anim) return;

            redraw();
            console.log(data);
        };

        tilesheet.src = '/resources/' + data.image;
    };



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

		if (viewType == 'tilesheet') {
			view = view_tilesheet;
			sheet.prepareSheet('tilesheet');
		} else if (viewType == 'spritesheet') {
			view = view_spritesheet;
			sheet.prepareSheet('spritesheet');
		} else if (viewType == 'npc') {
			view = view_npc;
			sheet.prepareSheet('npc');
		} else if (viewType == 'none') {
			view = null;
			sheet.clearSheet(true);
			sheet.clearTilesheet();
			return;
		} else {
			console.error("Bad view: "+viewType);
			return;
		}

		view.loadData(data, linkEl);
		view.show();
	};



	//> editor.js: load/switch between views (tilesheet/spritesheet/npc/intro); editing (tilesheet drag/drop, edit settings, hook buttons/settings)


	return interface;
};
