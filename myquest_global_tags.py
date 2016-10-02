import sys
import json
from pprint import pprint

data = sys.stdin.readlines()

with open('.myquest-globals-auto.json') as globals_file:
    jsonData = json.load(globals_file)

for arg in data:
    s = arg.strip()
    jsonData["globals"][s] = True


with open('.myquest-globals-auto.json', 'w') as globals_file:
    json.dump(jsonData, globals_file)
