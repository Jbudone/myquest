import bpy
import os
from functools import reduce
import mathutils
from mathutils import *
from math import *
import json
import sys
import argparse
from pprint import pprint


# TODO:
#  - Fix settings for render/images (broken); also add decent settings
#  - Fast/Quality renders (for test cases)
#  - Framestep ? (skip certain render frames?)
#  - Handle multiple meshes better
#  - Settings on top
#  - Improve pipeline (Blender -> ImageMagick) into one script
#  - Document the pipeline so its obvious how this works, and how to use it (build sprite.json -> discover forward/up vecs -> discover mesh bounds -> batch render)
#  - Preview animation (blender/bakesheet bash script): render/bake single animation into a gif; option to put it side-by-side with another pre-baked spritesheet/anim (eg. raptor attacking right while firefox sheet takes hit from left)
#  - Find vectors: accept input from user [0-9] for inputting which image has the correct vectors  (blender/bakesheet bash script)
#
#  - BUG: Fix necessity of specified camera offset; currently we have to manually determine this because the camera never accurately fits the mesh bounds


# Script Args
# FIXME: Sucks to have to parse blender related args
parser = argparse.ArgumentParser(description='Process some integers.')
parser.add_argument('file', nargs=1)
#parser.add_argument('--', nargs='*')
parser.add_argument('--verbose', nargs=1)
parser.add_argument('--background', nargs='*')
parser.add_argument('--python', nargs=1)
parser.add_argument('--quick', nargs='*')
parser.add_argument('--bounds', nargs='*', help="check for bounds of mesh / camera position")
parser.add_argument('--json', nargs=1, help="sprite json file")
parser.add_argument('--testmesh', nargs='*', help="test detected mesh")
args = parser.parse_args()

# Read sprite json file
jsonFile = args.json
if not jsonFile:
    print("No json file provided")
    sys.exit()

if not os.path.exists(jsonFile[0]):
    print("Json file not found!")
    sys.exit()

data = json.load(open(jsonFile[0]))
pprint(data)

# Check data for stuff we need
if 'animations' not in data:
    print("No animations found in json")
    sys.exit()

scene = bpy.data.scenes["Scene"]
obj_camera = bpy.data.objects["Camera"]
cwd = os.getcwd()
parentDir = cwd + "/"

# Render Sets
# This is what is rendered into individual animations
class RenderSet:
    layer = 0
    anim = ""
    firstFrame = 0
    lastFrame = 0
    animDir = ""
    def __init__(self, layerIndex, animName, animFramesBegin, animFramesEnd):
        self.layer = layerIndex
        self.anim = animName
        self.firstFrame = animFramesBegin
        self.lastFrame = animFramesEnd


# Read animations
renderSets = list()
animations = data['animations']
for i in range(len(animations)):
    animation = animations[i]
    renderSets.append( RenderSet(animation['layer'], animation['name'], animation['frameStart'], animation['frameEnd']) )


#
#
# Analyze Model
# Determine model bounds, camera positions, etc.
#
#


print("Analyzing Model")

# FIXME: Better way to find the model..
# Find the mesh items
meshItems = list()
meshItem = None
if 'meshName' in data:
    meshItem = bpy.data.objects[data['meshName']]
else:
    items = bpy.data.objects.items()
    meshItems = list(filter(lambda item: item[1].type != "CAMERA" and item[1].type != "LAMP", items))
    meshItem = meshItems[1][1]

boundsDirections = [
 (-1.0, -1.0, -1.0), 
 (-1.0, -1.0, 1.0),
 (-1.0, 1.0, 1.0),
 (-1.0, 1.0, -1.0),
 (1.0, -1.0, -1.0),
 (1.0, -1.0, 1.0),
 (1.0, 1.0, 1.0),
 (1.0, 1.0, -1.0)
]

# Local space -> World space
def worldBounds(obj):
    return [obj.matrix_world * Vector(corner) for corner in obj.bound_box]

# Given two bounds, which is furthest in the given direction
def maxAbsBounds(boundsA, boundsB, direction):
    scoreA = reduce( (lambda x, y: x + y), list(map(lambda bound: bound[0] * bound[1], list(zip(boundsA, direction)))) )
    scoreB = reduce( (lambda x, y: x + y), list(map(lambda bound: bound[0] * bound[1], list(zip(boundsB, direction)))) )
    if scoreA >= scoreB:
        return True, boundsA
    return False, boundsB


# Initial bounds
meshBounds = worldBounds(meshItem)

# Go through each mesh and find the max bounds
# FIXME

# Go through each step in the animation
meshBounds = list(map(lambda bound: maxAbsBounds(bound[0], bound[1], bound[2])[1], list(zip(meshBounds, worldBounds(meshItem), boundsDirections))))

# Find furthest bounds in each direction (mesh extents across animations)
# If we're also checking camera position, then store each frame that's has the
# furthest extents in each direction
maxBoundsFrames = [0 for i in range(len(boundsDirections))]
for i in range(len(renderSets)):
    renderSet = renderSets[i]
    for j in range(renderSet.firstFrame, renderSet.lastFrame):
        bpy.context.scene.frame_set(j)
        if not 'bounds' in args:
            meshBounds = list(map(lambda bound: maxAbsBounds(bound[0], bound[1], bound[2])[1], list(zip(meshBounds, worldBounds(meshItem), boundsDirections))))
        else:
            #
            # Go through all bounds again and determine max
            for k in range(len(boundsDirections)):
                curBounds = worldBounds(meshItem)
                sameMax, maxBetweenThese = maxAbsBounds(meshBounds[k], curBounds[k], boundsDirections[k])
                if not sameMax:
                    # New max bounds
                    #print("Found new max bounds: " + str(j) + " -- " + str(maxBetweenThese))
                    maxBoundsFrames[k] = (renderSet, j, maxBetweenThese)
                    meshBounds[k] = maxBetweenThese

# Center is just the center of the mesh extents
center = reduce( (lambda x, y: Vector(x) + Vector(y)), meshBounds )
center /= 8

if args.testmesh != None:
    print("Testing detected mesh..")
    print(meshItems)
    print("Using mesh: ")
    print(meshItem)
    print("Center: " + str(center))
    print("Mesh Bounds: " + str(meshBounds))
    sys.exit()

# Find ideal camera position for provided forward/up vectors
def determineCamera(vec, rad, offset):

    cameraDir = cos(rad) * vec[0] + sin(rad) * vec[1]
    print("Camera Dir: (" + str(cameraDir.x) + ", " + str(cameraDir.y) + ", " + str(cameraDir.z) + ")")

    # Cylinder
    # If we construct a cylinder centered on the mesh and oriented in the
    # camera direction, and set the cylinder radius to the distance of the
    # furthest point in the mesh extents to the middle (line along the center
    # of) the cylinder, that cylinder will help mark our camera position
    #
    # The camera position should start from the tip of the cylinder, and be
    # offset enough such that the cylinder head fits in the FOV of the camera
    #
    #  +\
    #  | \
    # R|  \
    #  |   \
    #  |____\. C
    #    D
    #  
    #  C Camera
    #  R Radius (of cylinder)
    #  D Distance
    #
    #  Tan(theta) = R / D
    #  D = R / Tan(theta)
    #
    # So Camera.position += D * CameraDir

    # Get Cylinder radius & tip
    # For each point in the extents, find the furthest distance (radius) and furthest point along camera normal (tip)
    cylinderRadius = -1.0
    cylinderTip = 0.0
    for i in range(len(meshBounds)):

        meshBound = meshBounds[i]
        #print("  Mesh bound: (" + str(meshBound.x) + ", " + str(meshBound.y) + ", " + str(meshBound.z) + ")")

        # Project onto normal
        # A + dot(AP,AB) / dot(AB,AB) * AB
        OP = meshBound - center
        OA = cameraDir
        pointOnNormal = center + OP.dot(OA) / OA.dot(OA) * OA
        #print("    Point on normal: (" + str(pointOnNormal.x) + ", " + str(pointOnNormal.y) + ", " + str(pointOnNormal.z) + ")")

        # Distance from center of cylinder to point
        # The maximum distance defines the radius of the cylinder
        vecToBound = meshBound - pointOnNormal
        distToBound = vecToBound.length
        if distToBound > cylinderRadius:
            cylinderRadius = distToBound

        # Is this point the furthest along the normal?
        normalDist = cameraDir.dot(Vector(meshBound - center))
        #print("    Tip at: " + str(normalDist))
        if normalDist > cylinderTip:
            cylinderTip = normalDist

    print("Cylinder radius: " + str(cylinderRadius))
    print("Cylinder tip: " + str(cylinderTip))
    cameraPos = center + cameraDir * (cylinderTip + 2.0 * cylinderRadius / tan(radians(49.1 / 2.0)) + offset) # FIXME: Get camera FOV
    return cameraPos, cameraDir, cylinderTip, cylinderRadius

# Move camera to position
# Used for debugging (when open in blender)
def testCameraPosition(camera, vec, deg, offset):
    rad = radians(deg)
    cameraPos, cameraDir, cylinderTip, cylinderRadius = determineCamera(vec, rad, offset)
    camera.location = cameraPos
    look_at(camera, center)
    bpy.ops.mesh.primitive_cylinder_add(radius = cylinderRadius, depth = 3.0, location = center)
    bpy.context.object.rotation_euler = camera.rotation_euler

# Fuck off, epsilon!
def cleanVector(vec):
    vec.x = round(vec.x, 6)
    vec.y = round(vec.y, 6)
    vec.z = round(vec.z, 6)

def look_at(camera, point):
    bpy.context.scene.update() # NOTE: Blender will postpone scene update (obj world matrix) until later
    loc_camera = camera.matrix_world.to_translation()
    direction = point - loc_camera
    # point the cameras '-Z' and use its 'Y' as up
    rot_quat = direction.to_track_quat('-Z', 'Y')
    # assume we're using euler rotation
    camera.rotation_euler = rot_quat.to_euler()
    bpy.context.scene.update() # NOTE: Blender will postpone scene update (obj world matrix) until later

def render(animation, writeStill, suppressOutput):
    if suppressOutput:
        old = os.dup(1)
        os.close(1)
        os.open("/dev/null", os.O_WRONLY) # should open on 1

    bpy.ops.render.render(animation=animation, write_still=writeStill)

    if suppressOutput:
        os.close(1)
        os.dup(old) # should dup to 1
        os.close(old) # get rid of left overs

# Render each potential rotation for user to determine which is accurate
def renderPossibleRotations(camera, offset):

    renderDir = parentDir + "shots.checkvec/"
    os.system("rm " + renderDir + "*.png")
    if not os.path.exists(renderDir):
        os.makedirs(renderDir)

    # FIXME: Get first anim frame
    bpy.context.scene.frame_set(1)

    # FIXME: Setup all plausible values for forward/up vecs
    possibleVecs = [
            (Vector((0, 0, 1)),  Vector((0, 1, 0)),  "index0" ),
            (Vector((0, 0, 1)),  Vector((0, -1, 0)), "index1" ),
            (Vector((0, 0, -1)), Vector((0, 1, 0)),  "index2" ),
            (Vector((0, 0, -1)), Vector((0, -1, 0)), "index3" ),
            (Vector((0, 1, 0)),  Vector((0, 0, 1)),  "index4" ),
            (Vector((0, 1, 0)),  Vector((0, 0, -1)), "index5" ),
            (Vector((0, -1, 0)), Vector((0, 0, 1)),  "index6" ),
            (Vector((0, -1, 0)), Vector((0, 0, -1)), "index7" )
            ]

    # For each possible forward/up vec, set the camera to the ideal position
    # for that rotation, and render for user
    result = ""
    for i in range(len(possibleVecs)):

        #
        # Forward Camera
        cameraPos, cameraDir, cylinderTip, cylinderRadius = determineCamera(possibleVecs[i], 0.0, offset)
        camera.location = cameraPos
        look_at(camera, center)

        # Render
        forwardFilename = "forward_" + possibleVecs[i][2]
        scene.render.filepath = renderDir + forwardFilename
        render(False, True, True)

        #
        # Top Camera
        cameraPos, cameraDir, cylinderTip, cylinderRadius = determineCamera(possibleVecs[i], radians(90.0), offset)
        camera.location = cameraPos
        look_at(camera, center)

        # Render
        topFilename = "top_" + possibleVecs[i][2]
        scene.render.filepath = renderDir + topFilename
        render(False, True, True)
        
        #
        # Combine Renders
        result += "Index " + possibleVecs[i][2] + ": { forward: " + str(possibleVecs[i][0]) + ", " + "top: " + str(possibleVecs[i][1]) + " }\n"
        os.system("convert " + renderDir + forwardFilename + ".png " + renderDir + topFilename + ".png +append " + renderDir + possibleVecs[i][2] + ".png")
        os.remove(renderDir + forwardFilename + ".png")
        os.remove(renderDir + topFilename + ".png")

    print("No rotation vectors found (forward/up vec)")
    print("You'll need to set forwardVec and upVec in the sprite's json")
    print("Find the index which matches the forward/up of the sprite, and enter the corresponding forward/up vectors into the json")
    print("{")
    print("    \"forwardVec\": [0, 0, 1],")
    print("    \"upVec\": [0, 1, 0]")
    print("}")
    print("")
    print("")
    print(result)

def getAllCameras(forwardVec, upVec, viewRad, offset):

    # Find all cameras (local space)
    objectForwardCamera = (forwardVec, upVec)
    objectBackCamera = (mathutils.Matrix.Rotation(radians(180), 4, objectForwardCamera[1]) * objectForwardCamera[0])
    objectLeftCamera = (mathutils.Matrix.Rotation(radians(90), 4, objectForwardCamera[1]) * objectForwardCamera[0])
    objectRightCamera = (mathutils.Matrix.Rotation(radians(270), 4, objectForwardCamera[1]) * objectForwardCamera[0])

    cleanVector(objectBackCamera)
    cleanVector(objectLeftCamera)
    cleanVector(objectRightCamera)

    # Find all ideal camera positions
    cameraPositions = []
    cameraPositions.append( determineCamera(objectForwardCamera, viewRad, offset) + tuple(['front']) )
    cameraPositions.append( determineCamera( (objectBackCamera, objectForwardCamera[1]), viewRad, offset) + tuple(['back']) )
    cameraPositions.append( determineCamera( (objectLeftCamera, objectForwardCamera[1]), viewRad, offset) + tuple(['left']) )
    cameraPositions.append( determineCamera( (objectRightCamera, objectForwardCamera[1]), viewRad, offset) + tuple(['right']) )

    return cameraPositions



# FIXME: Load up top w/ defaults stored in settings
viewRad = radians(15.0)
if 'viewAngle' in data:
    viewRad = radians(data['viewAngle'])

extraCameraOffset = 0.0
if 'cameraOffset' in data:
    extraCameraOffset = data['cameraOffset']

# FIXME: Need to determine the camera clip_end/clip_start
cameraClipEnd = 100.0 + extraCameraOffset
if 'cameraClipEnd' in data:
    cameraClipEnd = data['cameraClipEnd']

cameraClipStart = 0.1
if 'cameraClipStart' in data:
    cameraClipStart = data['cameraClipStart']

# FIXME: Wtf why can't we just edit camera's clip_end?
bpy.data.cameras["Camera"].clip_end = cameraClipEnd
bpy.data.cameras["Camera"].clip_start = cameraClipStart

frameStep = 1
if 'frameStep' in data:
    frameStep = data['frameStep']




#
#
# Render Model
#
#



# If no forward/up vector provided, then render all possible forward/up vecs
if not 'forwardVec' in data or not 'upVec' in data:
    print("No forward/up vector; rendering all possible forward/up vectors")
    renderPossibleRotations(obj_camera, extraCameraOffset)
    sys.exit()


forwardVec = Vector((data['forwardVec'][0], data['forwardVec'][1], data['forwardVec'][2]))
upVec = Vector((data['upVec'][0], data['upVec'][1], data['upVec'][2]))


# Are we trying to fit the bounds of the mesh in the camera?
if args.bounds != None:

    #
    # Render each max bounds frame for each camera
    print("Rendering max bounds for each camera")

    renderDir = parentDir + "shots.checkbounds/"
    os.system("rm " + renderDir + "*.png")
    if not os.path.exists(renderDir):
        os.makedirs(renderDir)

    camera = obj_camera
    cameraPositions = getAllCameras(forwardVec, upVec, viewRad, extraCameraOffset)

    # Render each maximum bounds frames
    for i in range(len(maxBoundsFrames)):
        boundsFrame = maxBoundsFrames[i]
        bpy.context.scene.frame_set(boundsFrame[1])

        # Render for each camera position
        filenames = []
        filenamesStr = ""
        for j in range(len(cameraPositions)):
            cameraPosition = cameraPositions[j]
            camera.location = cameraPosition[0]
            look_at(camera, center)
            filename = "bounds_" + str(i) + "." + str(j) + ".png"
            filenames.append(renderDir + filename)
            filenamesStr += renderDir + filename + " "
            scene.render.filepath = renderDir + filename
            render(False, True, True)

        # Merge renders
        os.system("convert " + filenamesStr + " +append " + renderDir + "bounds_" + str(i) + ".png")
        for j in range(len(filenames)):
            os.remove(filenames[j])

        # Just running a quick test?
        if args.quick != None:
            break

    sys.exit()


# Render all frames/camera pairs

# radius      ==> offset
# 0:  0.48455 ==> 1.35675  | Div: 2.8
# 10: 0.6415  ==> 1.732    | Div: 2.7
# 20: 0.78788 ==> 1.9697   | Div: 2.5
# 30: 0.9119  ==> 2.1887   | Div: 2.4
# 40: 1.009   ==> 2.32     | Div: 2.3
# 50: 1.077   ==> 2.638    | Div: 2.45
# 60: 1.11    ==> 3.00     | Div: 2.7
# 70: 1.114   ==> 3.34     | Div: 3.0
# 80: 1.08    ==> 3.575    | Div: 3.31
# 90: 1.02    ==> 3.67     | Div: 3.6


print("Batch Rendering Model")
pprint(renderSets)

cameraPositions = getAllCameras(forwardVec, upVec, viewRad, extraCameraOffset)

# Prepare directories for each anim/camera
for i in range(len(renderSets)):
    renderSet = renderSets[i]
    animDir = parentDir + "shots/" + renderSet.anim + "/"
    renderSet.animDir = animDir
    if not os.path.exists(animDir):
        os.makedirs(animDir)
        
    for j in range(len(cameraPositions)):
        cameraPosition = cameraPositions[j]
        outputDir = animDir + cameraPosition[4] + "/"
        if not os.path.exists(outputDir):
            os.makedirs(outputDir)
        else:
            os.system("rm " + outputDir + "*.png")
            


# FIXME: Having issues with this
defaultRenderSettings = list()
quickRenderSettings = list()
#quickRenderSettings.append(( "render", "alpha_mode", 'TRANSPARENT' )) # Background transparent
#quickRenderSettings.append(( "cycles", "min_bounces", 2 ))
#quickRenderSettings.append(( "cycles", "max_bounces", 3 ))
##quickRenderSettings.append(( "render", "tile_x", 256 ))
##quickRenderSettings.append(( "render", "tile_y", 256 ))
#quickRenderSettings.append(( "cycles", "samples", 6 ))


def setRenderOptions(renderSettings):
    for i in range(len(renderSettings)):
        renderSetting = renderSettings[i]
        defaultRenderSettings.append(renderSetting)
        
        sceneSetting = scene
        for j in range(len(renderSetting) - 2):
            sceneSetting = sceneSetting[renderSetting[j]]
        sceneSetting[renderSetting[len(renderSetting) - 2]] = renderSetting[len(renderSetting) - 1]
    

setRenderOptions(quickRenderSettings)

camera = obj_camera
for i in range(len(renderSets)):
    renderSet = renderSets[i]
        
    animDir = renderSet.animDir
    scene.frame_start = renderSet.firstFrame
    scene.frame_end = renderSet.lastFrame
    scene.frame_step = frameStep
    
    for j in range(len(cameraPositions)):
        cameraPosition = cameraPositions[j]
        camera.location = cameraPosition[0]
        look_at(camera, center)
        bpy.context.scene.camera = camera

        outputDir = animDir + cameraPosition[4] + "/"
        print("  Output dir: " + outputDir)
        scene.render.filepath = outputDir
        render(True, True, True)
                
print("Done!")
setRenderOptions(defaultRenderSettings)
