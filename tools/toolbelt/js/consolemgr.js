
const LOG_ERROR = 1 << 0,
    LOG_DONTLOGTOCONSOLE = 1 << 1;

const ConsoleMgr = (new function(){

    this.consoleEl = null;

    let popOpenTimer = -1;

    this.open = () => {
        this.consoleWindowEl.addClass('open');
        $('#consoleWindowClose').text('Close');
    };

    this.close = () => {
        this.consoleWindowEl.removeClass('open');
        $('#consoleWindowClose').text('Open');
    };

    let mouseHovering = false;

    this.initialize = () => {

        this.consoleEl = $('#consoleWindowContents');
        this.consoleWindowEl = $('#consoleWindow');

        $('#consoleWindowClose').click(() => {

            let isOpen = this.consoleWindowEl.hasClass('open');
            isOpen = !isOpen;

            if (isOpen) {
                this.open();
            } else {
                this.close();
            }

            popOpenTimer = -1;

            return false;
        });

        $('#consoleWindowClear').click(() => {

            this.consoleEl.empty();

            return false;
        });
        
        this.consoleWindowEl.hover(() => {
            mouseHovering = true;
        }, () => {
            mouseHovering = false;
        });
    };

    let logGroupEl = null;

    this.startLogGroup = () => {

        if (logGroupEl) {
            console.error("Error starting a new log group: There's already an active log group");
            return false;
        }

        logGroupEl = $('<div/>')
                        .addClass('consoleLogGroup')
                        .appendTo(this.consoleEl);
    };

    this.endLogGroup = () => {

        if (!logGroupEl) {
            console.error("Can't end log group: no active log group");
            return false;
        }

        logGroupEl = null;
    };

    this.log = (text, options) => {

        if (!text) {
            console.error("No log provided");
            debugger;
            return;
        }

        if (!(options & LOG_DONTLOGTOCONSOLE)) {
            if (options & LOG_ERROR) {
                console.error(text);
            } else {
                console.log(text);
            }
        }

        let splitText = text.split('\n');
        if (splitText.length > 1) {
            splitText.forEach((log) => {
                if (!log) log = " ";
                this.log(log, options | LOG_DONTLOGTOCONSOLE);
            });
            return;
        }

        const logEl = $('<span/>')
                            .addClass('consoleLog')
                            .text(text);

        if (options & LOG_ERROR) {
            logEl.addClass('consoleLogError');
        }

        
        if (logGroupEl) {
            logGroupEl.append(logEl);
        } else {
            this.consoleEl.append(logEl);
        }

        // Pop open if the console isn't already opened
        let isOpen = this.consoleWindowEl.hasClass('open');
        if (!isOpen) {
            this.open();
            popOpenTimer = 800000;
        }

        // Scroll to bottom
        this.consoleWindowEl.scrollTop( this.consoleWindowEl[0].scrollHeight )
    };

    this.step = (delta) => {

        if (popOpenTimer >= 0) {
            popOpenTimer -= delta;

            if (mouseHovering && popOpenTimer < 0) {
                popOpenTimer = 0;
            } else if (popOpenTimer < 0) {
                popOpenTimer = -1;

                this.close();
            }
        }
    };
});
