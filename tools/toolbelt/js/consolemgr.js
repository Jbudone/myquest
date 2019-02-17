
const LOG_ERROR = 1 << 0;

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

        const logEl = $('<span/>')
                            .addClass('consoleLog')
                            .text(text);

        if (options & LOG_ERROR) {
            logEl.addClass('consoleLogError');
            console.error(text);
        } else {
            console.log(text);
        }

        
        if (logGroupEl) {
            logGroupEl.append(logEl);
        } else {
            this.consoleEl.append(logEl);
        }

        // Pop open if the console isn't already opened
        this.open();
        popOpenTimer = 800000;
    };

    this.step = (delta) => {

        if (popOpenTimer >= 0) {
            popOpenTimer -= delta;

            if (popOpenTimer < 0) {
                popOpenTimer = -1;

                this.close();
            }
        }
    };
});
