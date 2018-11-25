
function primitiveComparator(it: any, v: any) {
	if(it < v) {
		return -1;
	}
	else if(it > v) {
		return 1;
	}
	
	return 0;
}


/**
 * Performs binary search on a sorted array and returns the index of the first found item with the given value
 * 
 * -1 is returned if the value is not found
 * 
 * NOTE: This will silently fail if the array is not sorted
 * NOTE: If there are duplicated in the array, this is NOT guranteed to find the duplicate with the lowest index (it may return any one of them)
 * 
 * @param arr
 * @param val
 * @param cmp
 * @param approximate if true, returned the closes node to the given if no exact match could be found (the returned index will either be the immediately above the slot for the value or immediately below it)
 */
export default function search<T, V>(
	arr: ReadonlyArray<T>,
	val: V,
	cmp?: ((item: T, v: V) => number)|null,
	approximate?: boolean
) : number {

	if(arr.length === 0) {
		return -1;
	}

	// But default, a primitive comparator will be used
	if(!cmp) {
		cmp = primitiveComparator;
	}

	let startIdx = 0;
	let endIdx = arr.length;

	// NOTE: The loop constraints are not important. we are essentially just doing a while(true) bounded above be any complexity > log(n) the actual expected performance of the search
	// NOTE: Even for an empty array, at least one iteration will be run just to hit the base case
	for(var it = 0; it < arr.length + 1; it++) {

		var midIdx = Math.floor((endIdx + startIdx) / 2);

		var c = cmp(arr[midIdx], val);

		if(c === 0) {
			return midIdx;
		}
		else if(endIdx - startIdx <= 1) {
			if(approximate) {
				return startIdx;
			}

			return -1; // Fail
		}
		else if(c < 0) { // Given item is less that the target value
			startIdx = midIdx + 1;
		}
		else { // if(c > 0)
			endIdx = midIdx;
		}
	}

	throw new Error('Search failed');
}
