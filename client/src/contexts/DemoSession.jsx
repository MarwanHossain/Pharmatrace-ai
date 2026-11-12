// DEMO ONLY: role selection is NOT authentication. No credentials are checked; nothing is stored.
import {createContext,useContext,useState} from 'react'
const Ctx=createContext(null)
export const DemoSessionProvider=({children})=>{const[role,setRole]=useState(null);return<Ctx.Provider value={{role,setRole}}>{children}</Ctx.Provider>}
export const useDemoSession=()=>useContext(Ctx)
