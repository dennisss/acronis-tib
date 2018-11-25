import { SliceConfig } from '../slice';
import { ParseXML, AssertKeys, AssertValidUUID } from '../utils';
import assert from 'assert';


export async function ParseConfigXML(str: string): Promise<SliceConfig> {

	let obj = await ParseXML(str);

	AssertKeys(obj, ['MetaInfo']);
	obj = obj['MetaInfo'];

	// TODO: Some other parameters are optional?
	AssertKeys(obj, ['IncludePath', 'MachineId'], true);

	if(!obj['MachineId']) {
		throw new Error('Missing machine id');
	}

	let incs: string[]|undefined;
	
	if(obj['IncludePath']) {
		assert(obj['IncludePath'] instanceof Array);
		for(var p of obj['IncludePath']) {
			assert(typeof(p) === 'string');
		}

		incs = obj['IncludePath'];
	}


	assert(obj['MachineId'] instanceof Array);
	assert(obj['MachineId'].length === 1);
	let machineId = obj['MachineId'][0];
	assert(machineId[0] === '"' && machineId[machineId.length - 1] === '"');
	machineId = machineId.slice(1, machineId.length - 1);
	AssertValidUUID(machineId);

	return {
		machine_id: machineId,
		includePaths: incs
	};
}