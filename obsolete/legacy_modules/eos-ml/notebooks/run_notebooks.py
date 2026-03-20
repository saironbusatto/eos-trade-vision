import subprocess
import os

notebook_dir = r'C:\Users\sairo\Projects\EOS\eos-ml\notebooks'
os.chdir(notebook_dir)
notebooks = [
    '01_eda.ipynb',
    '02_stationarity.ipynb',
    '03_labeling.ipynb',
    '04_feature_eng.ipynb',
    '05_train_gmm.ipynb',
    '06_train_xgb.ipynb'
]

for nb in notebooks:
    print(f'\n===== Executing {nb} =====')
    result = subprocess.run(['jupyter', 'nbconvert', '--to', 'notebook', '--execute', '--ExecutePreprocessor.timeout=600', nb])
    if result.returncode != 0:
        print(f'Error executing {nb}')
    else:
        print(f'Successfully executed {nb}')
