Part 2: Online Exam
Now let's see what you can do with a computer. You can use all the AI you want, or code it by hand. There are three steps:

First, create a web app which takes any ENS name (like vitalik.eth) and renders a simple profile page if that ENS name exists. Your app should display all populated fields that can be read from the Ethereum blockchain.
Then, extend your app to take in a list of ENS name pairs like (vitalik.eth, balajis.eth) to create an in-browser graph-based visualization of the corresponding social network using a Python library like networkx and/or a JavaScript graph visualization library. Make each node clickable such that it routes to the corresponding profile page that you built in step one.
Finally, extend your app further to make the edges editable, such that a user can add or delete edges from the browser. Your edits should be stored as friend relationships in a database like PostgreSQL, using a web framework like Django to intermediate between the browser actions and the database state.

After step one, you should have a live, deployed URL that we can immediately play with. As you proceed to steps two or three, in general it's better to have just one or two steps done perfectly than to have all three steps done haphazardly.