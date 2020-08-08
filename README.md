
A simple RPG game built for the web.


RPG Game
=================

For lack of a better name, this is myquest. Its a web-based, scalable, multiplayer rpg game. And perhaps someday it will be defined as an mmorpg. This game is running on ***nodejs***, ***mongodb***, and ***redis*** for the serverside, it utilizes ***websockets*** for communication, and takes advantage of ***underscore***, ***jquery***, ***requirejs***, and ***bluebird*** libraries. I'm using ***tiled map editor*** for making my maps, and a homebrewed spritesheet & tilesheet editor found in the tools folder. Development testing is done almost entirely in Google Chrome for Linux; so if you have anything else than that, be ready for bugs :)  The game is running 24/7 on AWS EC2.


Play now
------------

The game is under heavy active development, and contains many bugs. If something unexpected happens, the server crashes, reports the error, and restarts automatically. If this happens simply refresh the page and login again. I expect the game will be in a more playable state by the end of 2015. Create a character and play at: [myquest](http://jbud.me/playground/myquest)


Client/Server
-----------------

The game can be split between its client and server portions. However, the primary benefit in using nodejs is the reusability of scripts between client and server side. Obviously there must be some differences between client/server side versions of the scripts, so a little extension script was built to extend objects into their client/server counterparts. This is done by injecting a server/client-specific model of the object into the object itself at runtime.

Task Runner
---------------

Live Debugger
---------------

Error Handler
---------------

Preprocessor
---------------

Preprocessor which breaks source scripts into its AST, parses it, and adds safety runtime checks to prevent unexpected crashes. Although we can catch unexpected exceptions in a global scope, we won't actually break at the source of the problem, which makes it hard to figure out what went wrong. Runtime checks essentially perform checks that would otherwise throw, eg. calling a function on a non-function, or accessing the member of an undefined variable.


FIXME:
 - Brief explanation of preprocessor
 - Side-by-side picture of code -> preprocessed -> DEBUGGER hit
    Could do video of:
        NOTE: USE Vim and record screen, then add into gimp as frame-by-frame. Then just remove the ones you don't want
        1) Typing code in left window
        2) Pause -- "Compiling results.." in right window
        3) Show results in right window, with coloured regions of source map
        4) Show simulated code running (stepping through each line) until we hit the assert -- runs in parallel in both windows
        5) Show assert hitting
 - Full explanation of loose typed JS, runtime exceptions, AST manipulation, assertions, whitelist, source map


Event Handling
---------------

This game makes heavy use of event handling (aka the observer pattern). Essentially an object is able to attach a listener to another object to listen for certain events it may invoke (eg. a character listens to its foe invoking the EVT_MOVED event, in case he tries to flee from battle). When an event is invoked, it checks which observers are listening to it, and triggers those observers to handle their callbacks. Those observers will either queue their callback for the next most suitable time, or handle the callback immediately if necessary.



Screenshots
-----------

![1](images/rpg1.png)
![2](images/rpg2.png)
![3](images/rpg3.png)
![4](images/rpg4.png)


***WARNING***: Only tested under ***Google Chrome*** so far

