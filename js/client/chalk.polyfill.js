define(() => {

    const Chalk = {};

    const resetChalkSettings = () => {
        Chalk.color;
    };

    const colorLog = (color) => {
        return (msg) => {
            console.log(`%c ${msg}`, `color: ${color}`);
            resetChalkSettings();
        }
    };

    const setChalkSetting = (setting) => {
        return Chalk;
    };

    // Polyfill for Chalk
    Chalk.red    = colorLog('#F00');
    Chalk.blue   = colorLog('#00F');
    Chalk.yellow = colorLog('#FF0');
    Chalk.white  = colorLog('#FFF');
    Chalk.green  = colorLog('#0F0');

    Chalk.bold   = setChalkSetting('bold');
    Chalk.dim    = setChalkSetting('dim');
    Chalk.bgRed  = setChalkSetting('bgRed');

    return Chalk;
});
