/* Derived data, computed from the entries in memory and cached until the data is reloaded. Never stored. */
import {state,activeEntries} from "./core.js?v=4.6.0";
import {buildAliasMap,collectEntities,entitiesOf} from "./entities.mjs?v=4.6.0";
import {buildIndex} from "./semantic.mjs?v=4.6.0";

const cache={entries:null,notes:null,alias:null,entities:null,index:null};
function sync(){
  if(cache.entries!==state.entries||cache.notes!==state.entityNotes){
    cache.entries=state.entries;cache.notes=state.entityNotes;
    cache.alias=buildAliasMap(state.entityNotes);cache.entities=null;cache.index=null;
  }
}
export const aliasMap=()=>{sync();return cache.alias;};
export const entityMap=()=>{sync();return cache.entities||(cache.entities=collectEntities(state.entries,state.entityNotes));};
export const entityKeysOf=entry=>entitiesOf(entry,aliasMap()).map(e=>e.key);
/** The semantic index is built only when the user asks for it (feature switch) and only from entries that are not in the trash. */
export function semanticIndex(){sync();return cache.index||(cache.index=buildIndex(activeEntries()));}
export const mutedTopicSet=()=>new Set(state.mutedTopics);
export function hasMutedTopic(entry){
  if(!state.mutedTopics.length)return false;
  const muted=mutedTopicSet();
  return entityKeysOf(entry).some(k=>muted.has(k));
}
