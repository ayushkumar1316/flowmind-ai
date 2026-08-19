import { useContext } from "react";
import { PlanContext } from "../contexts/PlanContext";

export const usePlan = () => useContext(PlanContext);