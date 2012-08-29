STATES ?= $(shell cat states.txt)
STATES_JSON = $(STATES:%=states/%.json)

all: all-min.json

all-min.json: all.json
	python liljson.py $< $@

all.json:
	python compose.py $(STATES_JSON) > $@

states/%.json: states
	curl -s "https://raw.github.com/johan/world.geo.json/master/countries/USA/$*.geo.json" > $@

states:
	mkdir -p $@

clean:
	rm -f *.json

dist-clean: clean
	rm -f states/*.json
