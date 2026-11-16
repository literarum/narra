/* Derived data, computed from the entries in memory and cached until the data is reloaded. Never stored. */
import {state,activeEntries,todayKey} from "./core.js?v=4.7.0";
import {isSealedCapsule} from "./domain.mjs?v=4.7.0";
import {buildAliasMap,collectEntities,entitiesOf} from "./entities.mjs?v=4.7.0";
import {buildIndex} from "./semantic.mjs?v=4.7.0";
import {buildDocFreq} from "./intel.mjs?v=4.7.0";
import {stemRu} from "./domain.mjs?v=4.7.0";

const cache={entries:null,notes:null,alias:null,entities:null,index:null,docFreq:null};
function sync(){
  if(cache.entries!==state.entries||cache.notes!==state.entityNotes){
    cache.entries=state.entries;cache.notes=state.entityNotes;
    cache.alias=buildAliasMap(state.entityNotes);cache.entities=null;cache.index=null;cache.docFreq=null;
  }
}
export const aliasMap=()=>{sync();return cache.alias;};
export const entityMap=()=>{sync();return cache.entities||(cache.entities=collectEntities(state.entries.filter(e=>!isSealedCapsule(e,todayKey())),state.entityNotes));};
export const entityKeysOf=entry=>entitiesOf(entry,aliasMap()).map(e=>e.key);
/** The semantic index is built only when the user asks for it (feature switch) and only from entries that are not in the trash. */
export function semanticIndex(){sync();return cache.index||(cache.index=buildIndex(activeEntries()));}
/** Document frequencies of the visible diary, for «distinctive words» of an entry (computed once per data change). */
export function docFreq(){sync();return cache.docFreq||(cache.docFreq=buildDocFreq(activeEntries(),{stem:stemRu}));}
export const mutedTopicSet=()=>new Set(state.mutedTopics);
export function hasMutedTopic(entry){
  if(!state.mutedTopics.length)return false;
  const muted=mutedTopicSet();
  return entityKeysOf(entry).some(k=>muted.has(k));
}
