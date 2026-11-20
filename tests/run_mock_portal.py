"""Pokreće lažni portal iz desktop verzije (za testove mobilne aplikacije)."""
import sys, os
sys.path.insert(0, sys.argv[1]); sys.path.insert(0, os.path.join(sys.argv[1], 'tests'))
import mock_portal
mock_portal.create_app().run(host='127.0.0.1', port=int(sys.argv[2]))
