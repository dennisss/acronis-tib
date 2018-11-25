import { ConfigRecord } from './record';
import { SliceConfig, ProductInfo } from '../slice';
import { ParseXML, AssertKeys, AssertValidNumber, AssertValidUUID } from '../utils';
import assert from 'assert';


export function parseProductInfoTag(obj: any, config: SliceConfig) {

	AssertKeys(obj, ['$', 'version', 'build']);
	AssertKeys(obj['$'], ['name']);

	let name = obj['$']['name'];

	assert(obj['version'] instanceof Array); assert(obj['version'].length === 1);
	let ver = obj['version'][0];
	AssertKeys(ver, ['$']); AssertKeys(ver['$'], ['major', 'minor'])

	let ver_major = ver['$']['major'];
	AssertValidNumber(ver_major);

	let ver_minor = ver['$']['minor'];
	AssertValidNumber(ver_minor);

	assert(obj['build'] instanceof Array); assert(obj['build'].length === 1);
	let build = obj['build'][0];
	AssertKeys(build, ['$']); AssertKeys(build['$'], ['number']);

	let build_number = build['$']['number'];
	AssertValidNumber(build_number);


	let info: ProductInfo = {
		name: name,
		version: {
			major: parseInt(ver_major),
			minor: parseInt(ver_minor)
		},
		build_number: parseInt(build_number)
	};

	if(config.productinfo) {
		if(JSON.stringify(config.productinfo) !== JSON.stringify(info)) {
			throw new Error('Mismatching productinfo metadata');
		}
	}

	config.productinfo = info;
}

export function parseTaskIdTag(obj: any, config: SliceConfig) {
	AssertKeys(obj, ['$']);
	AssertKeys(obj['$'], ['id']);

	let id = obj['$']['id'];
	AssertValidUUID(id);

	if(config.task_id && config.task_id !== id) {
		throw new Error('Mismatch in task_id');
	}

	config.task_id = id;
}

export function parseMetadataTag(obj: any, config: SliceConfig) {

	let keys = ['productinfo', 'task_id', 'computer_id', 'compression', 'encryption'];
	AssertKeys(obj, keys);
	for(let k of keys) {
		assert(obj[k] instanceof Array);
		assert(obj[k].length === 1);
	}

	parseProductInfoTag(obj['productinfo'][0], config);
	parseTaskIdTag(obj['task_id'][0], config);

	let cidObj = obj['computer_id'][0]
	AssertKeys(cidObj, ['$']); AssertKeys(cidObj['$'], ['id']);
	
	let id = cidObj['$']['id'];
	AssertValidUUID(id);

	if(config.machine_id && config.machine_id !== id) {
		throw new Error('Mismatch in computer_id');
	}

	config.machine_id = id;


	let comp = obj['compression'][0];
	AssertKeys(comp, ['$']); AssertKeys(comp['$'], ['value']);

	let comp_level = comp['$']['value'];
	if(config.compression && config.compression !== comp_level) {
		throw new Error('Mismatch in compresion level');
	}

	config.compression = comp_level;


	let enc = obj['encryption'][0];
	AssertKeys(enc, ['$']); AssertKeys(enc['$'], ['value']);

	let enc_level = enc['$']['value'];
	if(config.encryption && config.encryption !== enc_level) {
		throw new Error('Mismatch in encrpytion level');
	}

	config.encryption = enc_level;
}


/**
 * Gets normalized slice configuration information from the metadata entries
 * This will append data to the given SliceConfig
 */
export async function ParseConfigRecord(r: ConfigRecord, config: SliceConfig): Promise<void> {

	for(let a of r.attrs) {

		let obj = await ParseXML(a.value);

		if(a.key === 'metainfo') {
			AssertKeys(obj, ['metainfo']);
			parseMetadataTag(obj['metainfo'], config);
		}
		// TODO: the metadata has everything, but I presume that these are here for backwards compatibility as they are redundant?
		else if(a.key === 'product_info') {
			AssertKeys(obj, ['productinfo']);
			parseProductInfoTag(obj['productinfo'], config);
		}
		else if(a.key === 'task_id') {
			AssertKeys(obj, ['task_id']);
			parseTaskIdTag(obj['task_id'], config);
		}
		else {
			throw new Error('Unknown config key: ' + a.key);
		}
	}

}

