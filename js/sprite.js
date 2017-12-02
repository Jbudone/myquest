define(() => {

    const Sprite = function(spriteID) {
        Ext.extend(this, 'sprite');

        // Load Sprite
        // ID of Sprite given..find and use sprite from sprites
        this.sheet    = Resources.sprites[spriteID];
        this.spriteID = spriteID;

        this.tileSize = this.sheet.tileSize.width;
        this.offset_x = this.sheet.offset.x;
        this.offset_y = this.sheet.offset.y;
        this.sprite_w = this.sheet.spriteSize.w;
        this.sprite_h = this.sheet.spriteSize.h;
        this.state    = { y: 0, x: 0, w: this.sprite_w, h: this.sprite_h };
        this.draw     = function(ctx) {};

    };

    return Sprite;
});
