[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)

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


Pathfinding
---------------

The game is tile based in terms of collisions aligning to 16x16 tiles, but entities can move to any continuous position making it appear not tile-based. This allows efficient pathfinding through A* on tiles, and resolving tile-based paths into usable continuous paths. Since the game is server authoritative npcs paths are determined on the server and broadcasted to nearby users. By only broadcasting paths to nearby users we avoid unnecessary overhead of sending paths to players who can't witness the path. Player paths are handled locally based off localized knowledge of your surroundings (eg. if you click to move on a cliff and the opening is out of sight, your pathfind will fail), then sent to the server for validation and broadcasting. Since players are volatile and can change paths frequently, you can easily become desynchronized w/ the server state; to work around this we re-path from the entity's current position to the path. In some cases you can become too desynchronized (eg. lag) and its faster to just teleport the entity to that position as a last resort.

To help w/ performance low priority paths are offloaded to a pathfinding worker thread which will pathfind and return the path shortly after. This prevents brutal stalls when you have many npcs chasing one player, and constantly updating their paths to catch up as the player moves. Since low priority paths are delayed you could run into situations where the entity stops -> waits for path -> adopts new path -> request new path -> stop -> wait -> etc. To get around this stuttering stop -> go cycle we can retain the current path and replace it w/ the new path when it comes through. Since the path is delayed and we've continued moving since then, the beginning of the path becomes stale and we need to re-path from our new position to the beginning of the delayed path. However, if we've been moving in the same direction (eg. East) as the beginning of the path (East), then we'd end up re-pathing from our current position (East) to the beginning of the path (West) in order to continue along the same direction (East); because of this we can instead re-path from our current position to a reasonable starting point in the received path. We can take our move speed and the time that the path was requested to determine the maximum distance we could have covered, then find that delta into the received path to determine our starting point that we want to re-path towards.



Map Editor
-----------

Browser based map editor for portability and ease of access. Uses webGL for highly efficient redrawing, and a paging system to incorporate blitting so that we only redraw what's necessary. 


Screenshots
-----------

![1](images/rpg1.png)
![2](images/rpg2.png)
![3](images/rpg3.png)
![4](images/rpg4.png)


***WARNING***: Only tested under ***Google Chrome*** so far

