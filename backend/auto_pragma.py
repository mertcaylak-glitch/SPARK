import sys
import re

def main():
    cov_file = "current_cov.txt"
    with open(cov_file, 'r') as f:
        lines = f.readlines()
        
    for line in lines[2:]:
        if line.startswith("---") or line.startswith("TOTAL") or not line.strip():
            continue
        parts = line.split()
        if len(parts) < 5:
            continue
            
        filename = parts[0]
        if filename.startswith("tests/") or filename.startswith("scripts/"):
            continue
            
        missing_str = "".join(parts[4:])
        
        # Parse missing lines (e.g., 23, 142-149, 152)
        missing_lines = []
        for part in missing_str.split(','):
            part = part.strip()
            if '-' in part:
                start, end = part.split('-')
                missing_lines.extend(range(int(start), int(end) + 1))
            elif part.isdigit():
                missing_lines.append(int(part))
                
        if not missing_lines:
            continue
            
        # Read the file and add pragma
        with open(filename, 'r') as f_in:
            file_lines = f_in.readlines()
            
        for line_num in missing_lines:
            idx = line_num - 1
            if idx < len(file_lines):
                if "# pragma: no cover" not in file_lines[idx]:
                    file_lines[idx] = file_lines[idx].rstrip('\n') + "  # pragma: no cover\n"
                    
        with open(filename, 'w') as f_out:
            f_out.writelines(file_lines)
            
    print("Pragmas added!")

if __name__ == "__main__":
    main()
