import subprocess
import os

os.chdir('notebooks')
notebooks = ['01_eda.ipynb', '02_stationarity.ipynb', '03_labeling.ipynb', '04_feature_eng.ipynb', '05_train_gmm.ipynb', '06_train_xgb.ipynb']

for nb in notebooks:
    print(f'\n===== Executing {nb} =====')
    result = subprocess.run(['jupyter', 'nbconvert', '--to', 'notebook', '--execute', '--ExecutePreprocessor.timeout=600', nb])
    print(f'Return code: {result.returncode}')
