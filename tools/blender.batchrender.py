import bpy
import os

# TODO:
#  2) Parse names "camera.XXXXX"
#  3) Find animations? Input? w/ animation names
#  5) Settings for render/images
#  6) Fast/Quality renders (for test cases)
#  7) Preview render (for faster checking + gimp baking / analysing)
#
#  - Framestep ? (skip certain render frames?)

print("Batch Rendering Model")
        
cwd = os.getcwd()
parentDir = cwd + "/shots/"
if not os.path.exists(parentDir):
    os.makedirs(parentDir)

# Fetch all camera
cameras = list()
items = bpy.data.objects.items()
for i in range(len(items)):
    item = items[i][1]
    if item.type == "CAMERA":
        print("Found camera: " + item.name)
        cameras.append(( item.name, item ))


# Render Sets
# This is what is rendered into individual animations
class RenderSet:
    layer = 0
    anim = ""
    firstFrame = 0
    lastFrame = 0

    def __init__(self, layerIndex, animName, animFramesBegin, animFramesEnd):
        self.layer = layerIndex
        self.anim = animName
        self.firstFrame = animFramesBegin
        self.lastFrame = animFramesEnd

renderSets = list()
renderSets.append( RenderSet(0, "attack", 0, 38) )
renderSets.append( RenderSet(1, "dead", 0, 41) )
renderSets.append( RenderSet(2, "eat", 0, 320) )
renderSets.append( RenderSet(3, "hit", 0, 21) )
renderSets.append( RenderSet(4, "idle", 0, 241) )
renderSets.append( RenderSet(5, "run", 0, 21) )
renderSets.append( RenderSet(6, "shout", 0, 141) )
renderSets.append( RenderSet(7, "walk", 0, 51) )








  
#animFrames = list()
#animFrames.append(( "attack", 0, 20 ))
#animFrames.append(( "walk", 32, 42 ))

defaultRenderSettings = list()

quickRenderSettings = list()
quickRenderSettings.append(( "render", "alpha_mode", 'TRANSPARENT' )) # Background transparent
#quickRenderSettings.append(( "cycles", "min_bounces", 2 ))
#quickRenderSettings.append(( "cycles", "max_bounces", 3 ))
##quickRenderSettings.append(( "render", "tile_x", 256 ))
##quickRenderSettings.append(( "render", "tile_y", 256 ))
#quickRenderSettings.append(( "cycles", "samples", 6 ))

scene = bpy.data.scenes["Scene"]

def setRenderOptions(renderSettings):
    for i in range(len(renderSettings)):
        renderSetting = renderSettings[i]
        defaultRenderSettings.append(renderSetting)
        
        sceneSetting = scene
        for j in range(len(renderSetting) - 2):
            sceneSetting = sceneSetting[renderSetting[j]]
        sceneSetting[renderSetting[len(renderSetting) - 2]] = renderSetting[len(renderSetting) - 1]
    

setRenderOptions(quickRenderSettings)

#for i in range(len(animFrames)):
#    anim = animFrames[i]
for i in range(len(renderSets)):
    renderSet = renderSets[i]
    animDir = parentDir + renderSet.anim + "/"
    if not os.path.exists(animDir):
        os.makedirs(animDir)
        
    scene.frame_start = renderSet.firstFrame
    scene.frame_end = renderSet.lastFrame
    
    for j in range(len(cameras)):
        camera = cameras[j]
        bpy.context.scene.camera = camera[1]
        outputDir = animDir + camera[0] + "/"
        if not os.path.exists(outputDir):
            os.makedirs(outputDir)
            
        print("  Output dir: " + outputDir)
        scene.render.filepath = outputDir
        bpy.ops.render.render(animation=True, write_still=True)
                
print("Done!")
setRenderOptions(defaultRenderSettings)
