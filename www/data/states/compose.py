import json, sys

features = []
collection = {
    "type": "FeatureCollection",
    "features": features
}

for filename in sys.argv[1:]:
    fp = open(filename, 'r')
    state = json.load(fp)['features'][0]
    # "USA-CA" -> "CA"
    abbr = state['id'][4:]
    state['id'] = state['properties']['abbr'] = abbr
    fp.close()
    features.append(state)

json.dump(collection, sys.stdout)
