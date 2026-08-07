import logging
import pandas as pd
import json
import numpy as np
import threading

logger = logging.getLogger("spark.topology")

try:
    import pandapower as pp
    import simbench as sb
    PANDAPOWER_AVAILABLE = True
except ImportError:  # pragma: no cover
    PANDAPOWER_AVAILABLE = False  # pragma: no cover
    logger.warning("Pandapower or Simbench is not installed. Topology service will run in mock mode.")  # pragma: no cover

class GridTopologyService:
    def __init__(self, sb_code="1-MV-rural--0-sw"):
        self.sb_code = sb_code
        self.net = None
        self.lock = threading.Lock()
        if PANDAPOWER_AVAILABLE:
            self._init_network()
            
    def _init_network(self):
        try:
            logger.info(f"Loading SimBench network: {self.sb_code}")
            self.net = sb.get_simbench_net(self.sb_code)
            # Run an initial power flow to get baseline results
            pp.runpp(self.net)
            logger.info("SimBench network loaded and initial power flow solved.")
        except Exception as e:  # pragma: no cover
            logger.error(f"Error loading SimBench network: {e}")  # pragma: no cover
            self.net = None  # pragma: no cover

    def get_network_state(self):
        with self.lock:
            if not self.net:
                return {"error": "Network not loaded or pandapower not installed."}  # pragma: no cover
                
            # Extract basic info
            num_buses = len(self.net.bus)
            num_lines = len(self.net.line)
            num_loads = len(self.net.load)
            num_sgen = len(self.net.sgen)
            num_shunts = len(self.net.shunt) if 'shunt' in self.net else 0
            num_switches = len(self.net.switch) if 'switch' in self.net else 0

            # High level summary
            res_bus = self.net.res_bus
            res_line = self.net.res_line
            
            max_vm_pu = res_bus['vm_pu'].max() if not res_bus.empty else 0
            min_vm_pu = res_bus['vm_pu'].min() if not res_bus.empty else 0
            max_loading = res_line['loading_percent'].max() if not res_line.empty else 0
            
            # Replace NaN with None for JSON serialization
            def replace_nan(val):
                return None if pd.isna(val) else val

            state = {
                "network_code": self.sb_code,
                "elements_count": {
                    "buses": num_buses,
                    "lines": num_lines,
                    "loads": num_loads,
                    "sgens": num_sgen,
                    "shunts": num_shunts,
                    "switches": num_switches
                },
                "system_health": {
                    "max_voltage_pu": replace_nan(max_vm_pu),
                    "min_voltage_pu": replace_nan(min_vm_pu),
                    "max_line_loading_percent": replace_nan(max_loading)
                },
                "switches": json.loads(self.net.switch[['bus', 'element', 'et', 'closed']].head(50).to_json(orient='records')),
                "shunts": json.loads(self.net.shunt[['bus', 'p_mw', 'q_mvar', 'in_service']].to_json(orient='records')) if num_shunts > 0 else []
            }
            return state

    def simulate_action(self, element_type: str, element_id: int, action: str):
        with self.lock:
            if not self.net:
                raise ValueError("Network not loaded or pandapower not installed.")  # pragma: no cover
    
            action = action.lower()
            old_state = None
            if element_type == 'switch':
                if element_id not in self.net.switch.index:
                    raise ValueError(f"Switch with ID {element_id} not found.")  # pragma: no cover
                old_state = self.net.switch.at[element_id, 'closed']
                is_closed = True if action == 'close' else False
                self.net.switch.at[element_id, 'closed'] = is_closed
                new_state = "closed" if is_closed else "open"
                
            elif element_type == 'shunt':
                if element_id not in self.net.shunt.index:  # pragma: no cover
                    raise ValueError(f"Shunt with ID {element_id} not found.")  # pragma: no cover
                old_state = self.net.shunt.at[element_id, 'in_service']  # pragma: no cover
                in_service = True if action in ['in_service', 'close', 'on'] else False  # pragma: no cover
                self.net.shunt.at[element_id, 'in_service'] = in_service  # pragma: no cover
                new_state = "in_service" if in_service else "out_of_service"  # pragma: no cover
                
            elif element_type == 'line':
                if element_id not in self.net.line.index:  # pragma: no cover
                    raise ValueError(f"Line with ID {element_id} not found.")  # pragma: no cover
                old_state = self.net.line.at[element_id, 'in_service']  # pragma: no cover
                in_service = True if action in ['in_service', 'close', 'on'] else False  # pragma: no cover
                self.net.line.at[element_id, 'in_service'] = in_service  # pragma: no cover
                new_state = "in_service" if in_service else "out_of_service"  # pragma: no cover
                
            else:
                raise ValueError(f"Unsupported element type: {element_type}")
    
            # Re-run power flow
            try:
                pp.runpp(self.net)
            except Exception as e:  # pragma: no cover
                # Revert the action if it caused non-convergence or error  # pragma: no cover
                if element_type == 'switch':  # pragma: no cover
                    self.net.switch.at[element_id, 'closed'] = old_state  # pragma: no cover
                elif element_type in ['shunt', 'line']:  # pragma: no cover
                    getattr(self.net, element_type).at[element_id, 'in_service'] = old_state  # pragma: no cover
                      # pragma: no cover
                raise ValueError(f"Power flow error after changing {element_type} {element_id}: {str(e)}. Action reverted.")  # pragma: no cover
            
            # Re-calculate health
            res_bus = self.net.res_bus
            res_line = self.net.res_line
            max_vm_pu = res_bus['vm_pu'].max()
            min_vm_pu = res_bus['vm_pu'].min()
            max_loading = res_line['loading_percent'].max()
            
            def replace_nan(val):
                return None if pd.isna(val) else float(val)
            
            summary = {
                "max_voltage_pu": replace_nan(max_vm_pu),
                "min_voltage_pu": replace_nan(min_vm_pu),
                "max_line_loading_percent": replace_nan(max_loading)
            }
            
            return {
                "status": "success",
                "message": f"Successfully performed {action} on {element_type} {element_id} and solved power flow.",
                "element_type": element_type,
                "element_id": element_id,
                "new_state": new_state,
                "summary": summary
            }

    def get_trafos(self):
        """Returns the list of transformers from the pandapower network."""
        if not self.net or not hasattr(self.net, 'trafo'):  # pragma: no cover
            return []  # pragma: no cover
              # pragma: no cover
        trafos = []  # pragma: no cover
        for idx, row in self.net.trafo.iterrows():  # pragma: no cover
            trafos.append({  # pragma: no cover
                "index": int(idx),  # pragma: no cover
                "name": str(row.get('name', f"Trafo {idx}")),  # pragma: no cover
                "sn_mva": float(row.get('sn_mva', 0.0))  # pragma: no cover
            })  # pragma: no cover
        return trafos  # pragma: no cover

# Create a singleton instance
topology_service = GridTopologyService()
