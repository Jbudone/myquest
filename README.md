
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


Event Handling
---------------

This game makes heavy use of event handling (aka the observer pattern). Essentially an object is able to attach a listener to another object to listen for certain events it may invoke (eg. a character listens to its foe invoking the EVT_MOVED event, in case he tries to flee from battle). When an event is invoked, it checks which observers are listening to it, and triggers those observers to handle their callbacks. Those observers will either queue their callback for the next most suitable time, or handle the callback immediately if necessary.


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

