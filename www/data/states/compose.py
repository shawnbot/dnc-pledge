import json, sys

features = []
collection = {
    "type": "FeatureCollection",
    "features": features
}

for filename in sys.argv[1:]:
    fp = open(filename, 'r')
    try:
        state = json.load(fp)['features'][0]
    except Exception, e:
        print >> sys.stderr, "Choked on %s: %s" % (filename, e)
    # "USA-CA" -> "CA"
    abbr = state['id'][4:]
    state['id'] = state['properties']['abbr'] = abbr
    fp.close()
    features.append(state)

json.dump(collection, sys.stdout)
